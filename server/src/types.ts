/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // D1 Database binding
  DB: D1Database

  // Durable Object namespace for game rooms (one per game)
  GAME_ROOM: DurableObjectNamespace
}
