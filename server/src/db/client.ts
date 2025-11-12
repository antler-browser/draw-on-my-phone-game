/**
 * Database client factory for Cloudflare D1
 *
 * Creates a Drizzle ORM instance from a D1 database binding.
 * This is called per-request with the D1 binding from env.
 */
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema.js'

/**
 * Create a Drizzle database instance from a D1 binding
 * @param d1 - D1Database binding from Cloudflare Workers environment
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Database = ReturnType<typeof createDb>
