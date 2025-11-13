# CLAUDE.md for Meetup Mini App

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An IRL Browser mini app for meetup check-ins with real-time attendee list. Uses `window.irlBrowser` API for profile access with JWT verification. This mini app is meant to run inside an IRL Browser like Antler. See `/docs/irl-browser-standard.md` for IRL Browser Standard specification.

**Project Structure**: This is a pnpm workspace monorepo with three packages:
- `client/` - React frontend
- `server/` - Cloudflare Workers, D1 (SQLite), Durable Objects
- `shared/` - Shared utilities (JWT verification, Social links, etc.)

## Key Files and Directories

### Client (`/client/`)
- `/client/src/components/`: React components
  - `/QRCodePanel.tsx` - Shows a QR code for app. Hidden on mobile, visible on desktop.
  - `/Avatar.tsx` - Displays a user's avatar or placeholder if no avatar is set.
  - `/UserList.tsx` - Real-time list of meetup users
  - `/UserDetail.tsx` - Displays detailed user profile information when a user is selected
- `/client/src/app.tsx` - Main component with IRL Browser integration and profile display
- `/client/src/main.tsx` - Entry point that renders App (initializes IRL Browser Simulator in dev mode)
- `/client/public/`: Public files
  - `irl-manifest.json` - Mini app IRL Browser manifest with metadata and requested permissions
  - `antler-icon.webp` - Mini app icon
- `/client/vite.config.ts` - Vite configuration with proxy to backend

### Server (`/server/`)
- `/server/src/index.ts` - Cloudflare Workers entry point with Hono router, API endpoints, and WebSocket handling
- `/server/src/durable-object.ts` - Durable Object class for real-time WebSocket connections (WebSocket message types defined inline)
- `/server/src/db/client.ts` - Database client factory for Cloudflare D1
- `/server/src/db/schema.ts` - Database schema (used by Drizzle Kit to generate migrations)
- `/server/src/db/models/index.ts` - Export file for all models
- `/server/src/db/models/users.ts` - User database model
- `/server/src/db/migrations/` - D1 SQL migration files (auto-generated)
- `/server/drizzle.config.js` - Drizzle Kit configuration for migrations
- `/server/src/types.ts` - Type definitions for Cloudflare Workers environment bindings

### Shared (`/shared/`)
- `/shared/src/jwt.ts` - JWT decoding and verification utilities (`decodeAndVerifyJWT`, `decodeJWT`)
- `/shared/src/social-links.ts` - Social links utilities (platform validation, handle normalization, URL generation)

### Root
- `/docs/`: Documentation
  - `irl-browser-standard.md` - IRL Browser Standard specification
- `/scripts/`: Helper scripts
  - `update-metadata.js` - Updates irl-manifest.json and index.html from data.json
  - `ensure-client-dist.js` - Ensures client build exists (runs before dev via predev hook)
  - `migrate-local.ts` - Database migration script for local development
- `data.json` - Meetup metadata (title, description) used by update-metadata.js
- `alchemy.run.ts` - Alchemy deployment configuration for Cloudflare Workers
- `pnpm-workspace.yaml` - Workspace configuration
- `.alchemy/state.json` - Tracks your infrastructure (created after first deployment)
- `wrangler.toml` - Cloudflare configuration (used in development only)

## Development Commands

All commands run from the workspace root:

```bash
pnpm install              # Install all workspace dependencies
pnpm run dev              # Start both Wrangler dev server and client in parallel (runs predev hook first)
pnpm run dev:client       # Start only client dev server
pnpm run dev:server       # Start only Wrangler dev server (Cloudflare Workers local mode)
pnpm run build            # Build shared package, then client
pnpm run build:client     # Build only client package
pnpm run deploy:cloudflare  # Deploy to Cloudflare using Alchemy
pnpm run destroy:cloudflare # Destroy Cloudflare deployment using Alchemy
```

### Database Commands

```bash
pnpm db:generate          # Generate D1 migration files from schema (from /server/)
pnpm db:migrate:dev       # Run all pending migrations on local D1 database (from root)
pnpm db:push              # Push schema changes directly without migrations (from /server/)
pnpm db:studio            # Open Drizzle Studio for database inspection (from /server/)
```

**Migration Workflow:**
1. **Edit schema** in `/server/src/db/schema.ts`
2. **Generate migration**: `pnpm db:generate` (uses `drizzle.config.js` to read schema)
3. **Apply locally**: `pnpm db:migrate:dev` (runs `migrate-local.ts` which uses `getPlatformProxy()`)
4. **Deploy to production**: `pnpm run deploy:cloudflare` (Alchemy automatically applies migrations via `alchemy.run.ts`)

**Note**: For production, Alchemy reads the `migrationsDir` setting and applies any new migrations during deployment.

### Pre-Dev Hook
The `pnpm run dev` command automatically runs a `predev` hook that executes `ensure-client-dist.js` to ensure the client build exists before starting the dev servers.

**Note**: This is a pnpm workspace. All dependencies are installed at the root level. Shared dependencies (@noble/curves, base58-universal, jwt-decode, drizzle-orm) are hoisted to the workspace root.

### API Endpoints

The server exposes the following REST and WebSocket endpoints:

**REST Endpoints:**
- `POST /api/add-user` - Add or update user profile (requires JWT in Authorization header)
- `POST /api/add-avatar` - Add or update user avatar (requires JWT, accepts multipart/form-data)
- `DELETE /api/remove-user` - Remove user from meetup (requires JWT in Authorization header)
- `GET /api/users` - Get all users from the database (public, no auth required)
- `GET /health` - Health check endpoint

**WebSocket Endpoint:**
- `GET /api/ws` - Establish WebSocket connection for real-time updates

### Real-time Architecture

The app uses a **single Durable Object instance** (`idFromName: 'default'`) for WebSocket broadcasting:

1. **Client connects**: WebSocket upgrade request → Worker → Durable Object
2. **User checks in**: POST `/api/add-user` → Worker verifies JWT → Saves to D1 → Notifies DO
3. **Broadcast**: Durable Object sends WebSocket message to all connected clients
4. **Auto-shutdown**: DO closes after 2 hours of inactivity

### WebSocket Message Types

WebSocket message types are defined inline in `/server/src/durable-object.ts` and `/server/src/index.ts`.

**Client ← Server**:
- `connected` - Initial connection confirmation
- `user-joined` - New user or updated user profile
- `user-left` - User removed from meetup
- `meetup-ended` - Event ended (idle or time limit)

### JWT Verification Pipeline (`/shared/src/jwt.ts`)
The shared package exports `decodeAndVerifyJWT` which is used by both client and server to verify cryptographically signed user data from the IRL Browser.

1. Decode JWT with `jwt-decode`
2. Extract issuer DID from `iss` claim
3. Reject if JWT is expired (`exp` claim)
4. *(Optional)* Audience check (`aud` claim) - Currently commented out for development, should be enabled in production
5. Parse public key from DID: strip `did:key:z`, decode base58, remove multicodec prefix `[0xed, 0x01]`
6. Verify Ed25519 signature using `@noble/curves`: `ed25519.verify(signature, message, publicKeyBytes)`
7. Return typed payload

**Key detail**: Uses @noble/curves library for signature verification. (Cannot use Web Crypto APIs as most mobile browsers don't support Ed25519 yet.)

**Import**: Both client and server import from `@meetup/shared` workspace package.

### Responsive Layout
- **Mobile**: Single column, QR code hidden
- **Desktop**: Two columns with QR code panel on left

## Deployment with Alchemy

This project uses [Alchemy](https://alchemy.run) for deployment to Cloudflare Workers.

### Configuration
- `alchemy.run.ts` - Alchemy configuration file defining the Cloudflare Worker, D1 database, and Durable Object bindings
- `.alchemy/state.json` - Created after first deployment, tracks infrastructure state

### Deployment Commands
```bash
pnpm run deploy:cloudflare  # Deploy to Cloudflare
pnpm run destroy:cloudflare # Destroy Alchemy deployment
```

No manual migration steps needed - everything is handled by `alchemy.run.ts` configuration.

## Development Workflow

### Debugging IRL Browser Mini Apps
The IRL Browser Simulator injects the `window.irlBrowser` API into a regular browser, allowing you to test your mini app locally without needing the Antler mobile app.

**Note:** This is a development-only tool and should never be used in production.

```typescript
if (import.meta.env.DEV) {
  const simulator = await import('irl-browser-simulator')
  simulator.enableIrlBrowserSimulator()
}
```

That's it! The simulator will:
- Inject `window.irlBrowser` into your page
- Load a default test profile (Paul Morphy)
- Show a floating debug panel
- Click "Open as X" to open a new tab and simulate multiple users
- Load a profile from the URL parameter `?irlProfile=<id>`

## Third Party Libraries

### Client
- **React** - UI framework
- **Tailwind CSS** - Utility-first CSS framework
- **qrcode.react** - QR code generation for meetup URLs
- **irl-browser-simulator** - IRL Browser debugging (dev only)
- **Vite** - Build tool and dev server

### Server
- **Hono** - Lightweight web framework for Cloudflare Workers
- **Drizzle ORM** - TypeScript ORM for D1 database operations
- **Drizzle Kit** - Migration generator and database studio
- **Cloudflare Workers** - Serverless runtime environment
- **Cloudflare D1** - Serverless SQLite database
- **Cloudflare Durable Objects** - Stateful WebSocket coordination

### Shared (hoisted to workspace root)
- **@noble/curves** - Ed25519 signature verification
- **base58-universal** - Base58 encoding/decoding for DIDs
- **jwt-decode** - JWT decoding
- **drizzle-orm** - Also hoisted for shared database types

### Development Tools (workspace root)
- **Alchemy** (0.77.0) - Deployment tool for Cloudflare
- **concurrently** - Run multiple npm scripts in parallel
- **tsx** - TypeScript execution for migration scripts

## Troubleshooting

### JWT Verification Failures
- Expired JWT (`exp` claim)
- Invalid signature
- Malformed DID (must start with `did:key:z`)
- Audience claim mismatch (must match production URL)

### Profile Not Loading
Check if API exists: `console.log(window.irlBrowser)`

### Build Errors
- Run `pnpm install`
- Check TypeScript errors: `pnpm run build`