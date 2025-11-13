# Meetup Mini App

A mini app built with Antler IRL Browser that displays a real-time list of attendees as they scan a QR code. Perfect for meetups and events.

## How It Works

1. User scans QR code with Antler IRL Browser
2. Client requests profile from `window.irlBrowser.getProfileDetails()` API
3. IRL Browser generates and signs JWT with profile details
4. Server verifies JWT, stores user in D1 database
5. Durable Object broadcasts update via WebSocket to all connected clients
6. Real-time attendee list updates automatically

**Note:** This repository is built to deploy to Cloudflare. For self-hosting, see [meetup-self-hosted](https://github.com/antler-browser/meetup-self-hosted). We recommend using Cloudflare for this app as it will work with the free tier.

## Project Structure

This is a pnpm workspace monorepo with three packages:
- `client/` - React frontend
- `server/` - Cloudflare Workers, D1 (SQLite), Durable Objects
- `shared/` - JWT verification and utilities

## Run the app locally

```bash
pnpm install              # Install dependencies
pnpm db:migrate:local     # Initialize local D1 database
pnpm run dev              # Start development server
```

**Optional:** Edit `data.json` to customize your meetup details (title, description, etc.)

Open `http://localhost:5173` in your browser. The IRL Browser Simulator will auto-login with a test profile.

### Debugging with IRL Browser Simulator

**Note:** The IRL Browser Simulator is a development-only tool. Never use in production.

The simulator automatically injects the `window.irlBrowser` API in development mode:

```typescript
if (import.meta.env.DEV) {
  const simulator = await import('irl-browser-simulator')
  simulator.enableIrlBrowserSimulator()
}
```

**Features:**
- Auto-loads test profile (Paul Morphy)
- Floating debug panel
- Click "Open as X" to simulate multiple users in separate tabs
- Load profiles via URL: `?irlProfile=<id>`

## Deployment

This app deploys entirely to Cloudflare using:
- **Cloudflare Workers** for API routes
- **Cloudflare D1** for SQLite database
- **Cloudflare Durable Objects** for WebSocket broadcasting
- **Alchemy SDK** for infrastructure-as-code

> **Prerequisites:** 
- Cloudflare account (free tier works!)
- Alchemy CLI installed (`brew install alchemy`)

**Note:** Alchemy stores the state of the deployment inside `.alchemy/state.json`. It is created after the first deployment. You can store this file locally, but we have added it to the `.gitignore` file to avoid committing it to the repository. We have configured Alchemy to store the state of the deployment inside a Cloudflare Durable Object, see `alchemy.run.ts` for more details.

Configure Cloudflare API token in Alchemy (see [Alchemy CLI Documentation](https://alchemy.run/docs/cli/configuration)):
```bash
alchemy configure
```

Copy `.env.example` to `.env` and update `ALCHEMY_STATE_TOKEN`. This is used to store the state of the deployment in a remote state store.


To deploy the app:
```bash
pnpm run deploy:cloudflare
```