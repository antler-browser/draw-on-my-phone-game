/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // D1 Database binding
  DB: D1Database

  // Durable Object namespace for real-time WebSocket broadcasting
  DURABLE_OBJECT: DurableObjectNamespace
}
