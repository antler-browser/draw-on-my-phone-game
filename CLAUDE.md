# CLAUDE.md for draw-on-my-phone Drawing Game

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A multiplayer drawing and guessing game built with Antler IRL Browser. Players alternate between drawing pictures and guessing what those pictures represent, creating hilarious chains of interpretations. This is a digital version of the classic "telephone with pictures" party game designed for at least 3 players.

**Game Flow:** Host creates game → Players join lobby → Game starts → Word selection → Drawing/guessing rounds (pass-the-phone) → Reveal all drawings and guesses on this chain

**Key Features:**
- Real-time multiplayer game rooms (at least 3 players per room)
- Physical pass-the-phone gameplay (each device represents one chain)
- Local-only content storage (words, drawings, guesses never uploaded to server)
- Host-controlled game start
- Configurable timer per turn (30s, 60s, or 90s)
- word list with 15+ categories for game content

**Authentication:** Uses `window.irlBrowser` API for profile access with JWT verification. This mini app is meant to run inside an IRL Browser like Antler. See `/docs/irl-browser-specification.md` for IRL Browser Specification specification.

**Project Structure**: This is a pnpm workspace monorepo with three packages:
- `client/` - React frontend with game UI components
- `server/` - Cloudflare Workers, D1 (SQLite), Durable Objects for game room management
- `shared/` - Shared utilities (JWT verification, game logic, types)

## Key Files and Directories

### Client (`/client/`)
- `/client/src/components/`: React components
  - `/CreateGame.tsx` - Game creation flow with timer configuration (30s/60s/90s options)
  - `/JoinGame.tsx` - Game joining flow (accepts gameId from URL parameter)
  - `/GameLobby.tsx` - Pre-game lobby showing players, QR code, and host controls
  - `/QRCodePanel.tsx` - Shows QR code for game joining (hidden on mobile, visible on desktop)
  - `/Avatar.tsx` - Displays a player's avatar or placeholder if no avatar is set
  - `/WordSelection.tsx` - Round 0 word selection from random word list (saves to localStorage)
  - `/DrawingView.tsx` - Drawing canvas with prompt from previous submission (reads from localStorage)
  - `/GuessView.tsx` - Guessing interface for what the drawing shows (saves to localStorage)
  - `/PassPhoneView.tsx` - Interstitial "Round Complete" screen
  - `/GameTimer.tsx` - Countdown timer with red pulse warning
  - `/ChainReveal.tsx` - Complete chain evolution display with physical phone passing (Phase 3, shows current player's chain only)
- `/client/src/stores/`: State management
  - `/gameStore.ts` - Zustand store for game state (shared + client-only state, localStorage for drawings/words/guesses)
- `/client/src/routes/`: Route components
  - `/Game.tsx` - Main game component with routing for all game phases
- `/client/src/app.tsx` - Main component with IRL Browser integration and game routing
- `/client/src/main.tsx` - Entry point that renders App (initializes IRL Browser Simulator in dev mode)
- `/client/public/`: Public files
  - `irl-manifest.json` - Mini app IRL Browser manifest with metadata and requested permissions
  - `antler-icon.webp` - Mini app icon
- `/client/vite.config.ts` - Vite configuration with proxy to backend

### Server (`/server/`)
- `/server/src/index.ts` - Cloudflare Workers entry point with Hono router, game API endpoints, and WebSocket handling
- `/server/src/durable-object.ts` - Durable Object class for game room WebSocket connections (one DO per game, WebSocket message types defined inline)
- `/server/src/db/client.ts` - Database client factory for Cloudflare D1
- `/server/src/db/schema.ts` - Database schema for games, players, and submissions tables (used by Drizzle Kit to generate migrations)
- `/server/src/db/models/index.ts` - Export file for all models
- `/server/src/db/models/games.ts` - Game room database model (CRUD operations for games table)
- `/server/src/db/models/players.ts` - Player database model (CRUD operations for players table)
- `/server/src/db/models/submissions.ts` - Submission database model (completion tracking for round progression)
- `/server/src/db/migrations/` - D1 SQL migration files (auto-generated)
- `/server/drizzle.config.js` - Drizzle Kit configuration for migrations
- `/server/src/types.ts` - Type definitions for Cloudflare Workers environment bindings

### Shared (`/shared/`)
- `/shared/src/jwt.ts` - JWT decoding and verification utilities (`decodeAndVerifyJWT`, `decodeJWT`)
- `/shared/src/types.ts` - Shared TypeScript types for game state, players, WebSocket messages, submissions
- `/shared/src/game-logic.ts` - Shared game logic (turn rotation, round progression, chain ownership, word selection)
- `/shared/src/index.ts` - Exports all shared utilities and types

### Root
- `/docs/`: Documentation
  - `irl-browser-specification.md` - IRL Browser Specification specification
  - `game-rules.md` - Complete draw-on-my-phone game rules and how to play
  - `technical-implementation.md` - Comprehensive architecture documentation (1,639 lines)
- `/scripts/`: Helper scripts
  - `ensure-client-dist.js` - Ensures client build exists (runs before dev via predev hook)
  - `migrate-local.ts` - Database migration script for local development
- `word-list.json` - 784 words/phrases across 19 categories (animals, food, objects, people, fantasy, etc.)
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
- `POST /api/game/create` - Create new game room (requires JWT, returns gameId and sets host)
- `POST /api/game/:id/join` - Join game lobby (requires JWT, only allowed in 'lobby' status)
- `POST /api/game/:id/start` - Start game (requires JWT, host-only, min 3 players, sets totalPlayers immutably)
- `POST /api/game/:id/submit` - Submit completion notification (requires JWT, no content sent, auto-advances rounds)

**WebSocket Endpoint:**
- `GET /api/ws?gameId=:id` - Establish WebSocket connection for game room (one connection per player per game)

### Real-time Architecture

The app uses **one Durable Object per game room** (`idFromName: 'game:${gameId}'`) for WebSocket broadcasting:

1. **Client connects**: WebSocket upgrade request with `?gameId=X` → Worker → Durable Object for that game
2. **Player joins**: POST `/api/game/:id/join` → Worker verifies JWT → Saves to D1 → Notifies DO → Broadcast to all players in room
3. **Game state updates**: POST `/api/game/:id/start` → Worker updates D1 → Notifies DO → Broadcast new state
4. **Broadcast**: Durable Object sends WebSocket message to all connected players in that game room
5. **Auto-eviction**: Cloudflare automatically hibernates DO when all connections close (game rooms are ephemeral)

**Key architectural decisions:**
- **D1 as source of truth**: All coordination state (games, players, submissions) persisted in D1, not Durable Object memory as this survives DO eviction/hibernation and enables stateless Worker handling
- **Immutable data**: Once game starts, `hostDid`, `timerDuration`, and `totalPlayers` never change
- **Shared state broadcast**: Same message sent to all players; clients compute personalized views
- **Local-only content**: All content (words, drawings, guesses) stored in localStorage only, never uploaded to server
- **Physical phone passing**: Each device stores its own chain, phones physically passed to view other chains
- **Server as coordinator**: REST API tracks completion only, Durable Objects handle real-time sync

### WebSocket Message Types

WebSocket message types are defined inline in `/server/src/durable-object.ts` and `/shared/src/types.ts`.
- `game_state_full` - Full game state with players array (sent on connection and after state changes)
- `game_state_update` - Lightweight state updates without players array (400x smaller for round updates)

**Note**: All game actions (create, join, start, submit) go through REST API endpoints, not WebSocket messages. WebSocket is used only for broadcasting state updates to all players in a room.

### State Management (Zustand Store)

**File**: `/client/src/stores/gameStore.ts`

The game uses Zustand for client-side state management with a clear separation between:

**Shared State** (broadcast from server to all players):
- `gameId`, `status`, `hostDid`, `currentRound`, `timerDuration`, `totalPlayers`
- `players[]` array with avatar data

**Client-Only State** (local to each player):
- `myDid` - Current player's DID
- `wsConnection` - WebSocket connection instance
- `chainDrawings` - Map of round → canvas data (localStorage-backed)
- `chainSubmissions` - Map of round → submission metadata (localStorage-backed, words/guesses/drawings)

**Actions**:
- `updateFullGameState()` - Update entire game state from WebSocket
- `updateGameState()` - Partial update of game state
- `setMyDid()` - Set current player's DID
- `saveDrawing()` - Save canvas data to localStorage
- `getDrawing()` - Retrieve canvas data from localStorage
- `saveSubmission()` - Save word/guess/drawing metadata to localStorage
- `getSubmission()` - Retrieve submission metadata from localStorage
- `connectWebSocket()` - Establish WebSocket connection
- `disconnectWebSocket()` - Close WebSocket connection
- `clearGame()` - Reset all game state

**Computed Getters**:
- `getMyPlayer()` - Current player's data from players array
- `isHost()` - Whether current player is the host
- `getMyChain()` - Which chain I'm currently working on
- `getMyTask()` - Current task type ('word' | 'draw' | 'guess')
- `getDeadline()` - Timer deadline in milliseconds

**Benefits of this architecture**:
- Minimal boilerplate with all content stored locally
- No Provider wrapping needed
- Automatic DevTools integration
- Selective re-renders (components subscribe to specific slices)
- localStorage persistence for all game content and player identity

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

**Import**: Both client and server import from `@internal/shared` workspace package.

### Game Lifecycle and Phases

**Lobby**
1. Host creates game via `POST /api/game/create` (generates 6-char gameId, sets timerDuration)
2. Players join via `POST /api/game/:id/join` (turnPosition assigned sequentially)
3. Real-time player list updates via WebSocket (`game_state_full` messages)
4. Host clicks "Start Game" → `POST /api/game/:id/start` (validates min 3 players, sets totalPlayers immutably, status='playing')

**Gameplay**
1. **Word Selection** - Each player chooses from 4 random words, saved to localStorage
2. **Drawing/Guessing Rounds** - Players alternate between:
   - **Draw turn**: Draw the previous guess (or initial word), read from localStorage
   - **Guess turn**: Guess what the previous drawing shows, saved to localStorage
3. **Pass Phone** - Physical device passing between rounds
4. **Timer Enforcement** - GameTimer component with countdown and visual warnings
5. **Round Progression** - Auto-advances when all players submit (server counts completion notifications)
6. **Content Storage** - All content (words, drawings, guesses) stored locally on chain owner's device

**Reveal**
1. **Automatic Chain Display** - When game ends, each player automatically sees their own chain
2. **Chain Reveal** - Display complete chain evolution from localStorage:
   - Word cards showing initial word
   - Drawing cards - all drawings visible (stored on this device)
   - Guess cards showing guess text
3. **Physical Phone Passing** - To view other chains, players must physically pass phones around the table
   - If someone tries to view another player's chain on their device, they see a prompt explaining physical phone passing is required
4. **Navigation** - "Back to Home" button returns to game creation screen

### Responsive Layout
- **Mobile**: Single column, QR code hidden, optimized for phone passing
- **Desktop**: Two columns with QR code panel on left for easy joining

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

### Debugging Multiplayer Game with IRL Browser Simulator
The IRL Browser Simulator injects the `window.irlBrowser` API into a regular browser, allowing you to test the multiplayer game locally without needing multiple Antler mobile devices.

**Note:** This is a development-only tool and should never be used in production.

```typescript
if (import.meta.env.DEV) {
  const simulator = await import('irl-browser-simulator')
  simulator.enableIrlBrowserSimulator()
}
```

**Testing multiplayer game flow**:
1. Open `http://localhost:5173` in your browser
2. The simulator auto-loads a test profile (Paul Morphy)
3. Create a game as the host
4. Click "Open as X" in the floating debug panel to open new tabs with different player profiles
5. Join the same game from each tab (use the gameId URL parameter or QR code)
6. Test lobby, game start, and real-time sync with simulated players

**Features:**
- Inject `window.irlBrowser` into your page
- Load default test profile (Paul Morphy)
- Floating debug panel
- Click "Open as X" to simulate multiple players in separate tabs
- Load specific profiles via URL: `?irlProfile=<id>`
- Test game with `?gameId=<id>` URL parameter for direct joining

## Third Party Libraries

### Client
- **React** - UI framework
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - State management with persist middleware for localStorage (drawings, chains)
- **qrcode.react** - QR code generation for game joining URLs
- **react-canvas-draw** - Drawing canvas component with save/load functionality
- **irl-browser-simulator** - IRL Browser debugging (dev only, simulates multiple players)
- **Vite** - Build tool and dev server

### Server
- **Hono** - Lightweight web framework for Cloudflare Workers (routing, middleware)
- **Drizzle ORM** - TypeScript ORM for D1 database operations (type-safe queries)
- **Drizzle Kit** - Migration generator and database studio
- **Cloudflare Workers** - Serverless runtime environment
- **Cloudflare D1** - Serverless SQLite database (games, players, submissions tables)
- **Cloudflare Durable Objects** - Stateful WebSocket coordination (one DO per game room)

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

### IRL Browser API Not Available
- Check if API exists: `console.log(window.irlBrowser)`
- Ensure IRL Browser Simulator is enabled in dev mode
- Verify `import.meta.env.DEV` is true

### Game Not Found / Connection Issues
- Verify gameId is valid 6-character string
- Check WebSocket connection: `ws?gameId=<id>`
- Ensure Durable Object is running (check Wrangler logs)
- Try refreshing to reconnect WebSocket

### Players Not Syncing
- Check browser console for WebSocket errors
- Verify all players are connected to same gameId
- Check Durable Object broadcast logic in `/server/src/durable-object.ts`

### Build Errors
- Run `pnpm install` to ensure all dependencies are installed
- Check TypeScript errors: `pnpm run build`
- Verify database migrations are applied: `pnpm db:migrate:dev`