/**
 * Alchemy Configuration for Meetup Mini-App
 *
 * Deploys the meetup mini-app to Cloudflare:
 * - D1 Database for user storage
 * - Durable Object for real-time WebSocket broadcasting
 * - Worker for API and static asset serving
 */

import alchemy from 'alchemy'
import { D1Database, DurableObjectNamespace, Worker } from 'alchemy/cloudflare'
import type { Broadcaster } from './server/src/durable-object'

// Initialize Alchemy app
const app = await alchemy('meetup-irl')
const durableObjectName = 'Broadcaster'

/**
 * D1 Database
 * Stores meetup attendee information
 */
const database = await D1Database('database', {
  name: `${app.name}-${app.stage}-db`,
  migrationsDir: './server/src/db/migrations',
  adopt: true,
})

/**
 * Durable Object Namespace
 * Manages real-time WebSocket connections for broadcasting user updates
 */
const durableObject = DurableObjectNamespace<Broadcaster>(durableObjectName, {
  namespaceId: `${app.name}-${app.stage}-do`,
  className: durableObjectName,
  sqlite: true,
})

/**
 * Cloudflare Worker
 * Handles API routes, WebSocket upgrades, and serves static client assets
 * Note: Static assets configured via wrangler.toml [site] section
 */
export const worker = await Worker('worker', {
  name: `${app.name}-${app.stage}`,
  entrypoint: './server/src/index.ts',
  bindings: {
    DB: database,
    DURABLE_OBJECT: durableObject,
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
