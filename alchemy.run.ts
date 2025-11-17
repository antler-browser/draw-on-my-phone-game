/**
 * Alchemy Configuration for draw-on-my-phone Game
 *
 * Deploys the draw-on-my-phone game to Cloudflare:
 * - D1 Database for game and player storage
 * - Durable Object for real-time WebSocket game rooms (one per game)
 * - Worker for API and static asset serving
 */

import alchemy from 'alchemy'
import { Assets, D1Database, DurableObjectNamespace, Worker } from 'alchemy/cloudflare'
import { CloudflareStateStore } from 'alchemy/state'
import type { GameRoom } from './server/src/durable-object'

// Initialize Alchemy app with remote state store
const app = await alchemy('draw-on-my-phone-game', {
  stateStore: (scope) => new CloudflareStateStore(scope),
})

/**
 * D1 Database
 * Stores game rooms, players, and submissions
 */
const database = await D1Database('database', {
  name: `${app.name}-${app.stage}-db`,
  migrationsDir: './server/src/db/migrations',
  adopt: true,
})

/**
 * Static Assets
 * Client build directory containing the React app
 */
const staticAssets = await Assets({
  path: './client/dist',
})

/**
 * Durable Object Namespace
 * Manages real-time WebSocket connections for game rooms (one per game)
 */
const durableObjectName = 'GameRoom'
const durableObject = DurableObjectNamespace<GameRoom>(durableObjectName, {
  className: durableObjectName,
  sqlite: true,
})

/**
 * Cloudflare Worker
 * Handles API routes, WebSocket upgrades, and serves static client assets
 */
export const worker = await Worker('worker', {
  name: `${app.name}-${app.stage}`,
  entrypoint: './server/src/index.ts',
  bindings: {
    DB: database,
    GAME_ROOM: durableObject,
    ASSETS: staticAssets,
  },
  assets: {
    html_handling: 'auto-trailing-slash',
    not_found_handling: 'single-page-application',
  },
  url: true,
})

// Finalize deployment
await app.finalize()

console.log('✅ Alchemy deployment complete')
console.log(`📦 App: ${app.name}`)
console.log(`🌍 Stage: ${app.stage}`)
console.log(`🗄️  D1 Database: ${database.name}`)
console.log(`🔄 Durable Object: ${durableObjectName}`)
console.log(`⚡ Worker: ${worker.name}`)
console.log(`🌐 URL: ${worker.url}`)
