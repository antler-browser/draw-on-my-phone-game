# Draw-on-my-phone Game - Antler Mini App

A multiplayer drawing and guessing game built with Antler IRL Browser. Players alternate between drawing pictures and guessing what those pictures represent, creating hilarious chains of interpretations in this digital version of the classic "telephone with pictures" party game.

**Game Requirements:**
- 3-8 players (best with 4-6)
- Each player needs their own device with Antler IRL Browser
- Physical pass-the-phone gameplay (each device stores its own chain, phones passed to view others)

## How It Works

1. **Host creates game** - Scans QR code with Antler IRL Browser, creates game room with timer settings
2. **Players join lobby** - Other players scan same QR code and join the game room (max 8 players)
3. **Game starts** - Host starts the game when all players have joined
4. **Word selection** - Each player chooses a word from 5 random options to start their chain
5. **Drawing & guessing rounds** - Players alternate between drawing the previous guess and guessing the previous drawing
6. **Pass the phone** - After each turn, players physically pass their device to the next player in rotation
7. **Reveal chains** - After all rounds complete, players see the complete evolution of their chain
8. **Real-time sync** - Durable Objects broadcast game state via WebSocket to keep all players synchronized

**Authentication & Security:**
- Client requests profile from `window.irlBrowser.getProfileDetails()` API
- IRL Browser generates and signs JWT with profile details
- Server verifies JWT signature using Ed25519 cryptographic verification
- Player identity tied to game session

**For detailed game rules**, see `/docs/game-rules.md`
**For technical architecture**, see `/docs/technical-implementation.md`

**Note:** This repository is built to deploy to Cloudflare. We recommend using Cloudflare for this app as it will work with the free tier.

## Project Structure

This is a pnpm workspace monorepo with three packages:
- `client/` - React frontend with game UI (lobby, drawing canvas, guessing interface)
- `server/` - Cloudflare Workers, D1 (SQLite), Durable Objects for game room management
- `shared/` - JWT verification, game logic utilities, and shared types

**Key Files:**
- `word-list.json` - 784 words/phrases across 19 categories for game content
- `/docs/game-rules.md` - Complete game rules and how to play
- `/docs/technical-implementation.md` - Comprehensive architecture documentation

## Run the app locally

```bash
pnpm install              # Install dependencies
pnpm db:migrate:dev       # Initialize local D1 database
pnpm run dev              # Start development server
```

Open `http://localhost:5173` in your browser. The IRL Browser Simulator will auto-login with a test profile, allowing you to test the game locally.

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
- Click "Open as X" to simulate multiple players in separate tabs (perfect for testing multiplayer game)
- Load profiles via URL: `?irlProfile=<id>`
- Test game flow by opening multiple tabs with different profiles

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