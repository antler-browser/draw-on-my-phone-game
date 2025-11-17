import { eq, and, sql } from 'drizzle-orm'
import type { Database } from '../client'
import { players, type Player, type PlayerInsert } from '../schema'

/**
 * Add a player to a game
 */
export async function addPlayer(
  db: Database,
  gameId: string,
  did: string,
  name: string,
  avatar: string | null,
  turnPosition: number,
): Promise<Player> {
  const now = Math.floor(Date.now() / 1000)

  const playerData: PlayerInsert = {
    gameId,
    did,
    name,
    avatar,
    turnPosition,
    createdAt: now,
    updatedAt: now,
    
  }

  const result = await db.insert(players).values(playerData).returning()
  return result[0]
}

/**
 * Get all players for a game (ordered by turn position)
 */
export async function getPlayersByGameId(db: Database, gameId: string): Promise<Player[]> {
  return await db
    .select()
    .from(players)
    .where(eq(players.gameId, gameId))
    .orderBy(players.turnPosition)
    .all()
}

/**
 * Get a specific player by DID in a game
 */
export async function getPlayerByDid(
  db: Database,
  gameId: string,
  did: string
): Promise<Player | undefined> {
  return await db
    .select()
    .from(players)
    .where(and(eq(players.gameId, gameId), eq(players.did, did)))
    .get()
}

/**
 * Count players in a game
 */
export async function countPlayers(db: Database, gameId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(eq(players.gameId, gameId))
    .get()

  return result?.count ?? 0
}

/**
 * Remove a player from a game
 */
export async function removePlayer(db: Database, gameId: string, did: string): Promise<void> {
  await db.delete(players).where(and(eq(players.gameId, gameId), eq(players.did, did)))
}

/**
 * Delete all players (testing utility)
 */
export async function deleteAllPlayers(db: Database): Promise<void> {
  await db.delete(players)
}
