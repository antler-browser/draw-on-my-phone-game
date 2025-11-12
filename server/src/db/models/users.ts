/**
 * User model - Database operations for meetup users
 */

import { eq, desc, sql } from 'drizzle-orm'
import type { Database } from '../client.js'
import { users, type User } from '../schema.js'

// Re-export types
export type { User }

/**
 * Get all users ordered by check-in time (most recent first)
 */
export async function getAllUsers(db: Database): Promise<User[]> {
  return await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(1000)
}

/**
 * Get user by DID
 */
export async function getUserByDID(db: Database, did: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)

  return user
}

/**
 * Delete user by DID
 */
export async function deleteUserByDID(db: Database, did: string): Promise<void> {
  await db
    .delete(users)
    .where(eq(users.did, did))
}

/**
 * Upsert user profile (name and socials), preserves avatar on update
 */
export async function addOrUpdateUser(
  db: Database,
  did: string,
  name: string,
  socials: Array<{ platform: string; handle: string }>
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      did,
      name,
      socials: socials.map((social) => `${social.platform}:${social.handle}`).join(';'),
    })
    .onConflictDoUpdate({
      target: users.did,
      set: {
        name: sql`excluded.name`,
        socials: sql`excluded.socials`,
      },
    })
    .returning()

  return user
}

/**
 * Upsert user avatar, preserves name and socials on update
 */
export async function addOrUpdateUserAvatar(db: Database, did: string, avatar: string): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      did,
      avatar,
    })
    .onConflictDoUpdate({
      target: users.did,
      set: {
        avatar: sql`excluded.avatar`,
      },
    })
    .returning()

  return user
}

/**
 * Clear all users (useful for testing or resetting)
 */
export async function deleteAllUsers(db: Database): Promise<void> {
  await db.delete(users)
  console.log('✅ All users deleted')
}
