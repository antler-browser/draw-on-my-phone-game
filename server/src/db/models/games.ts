import { eq } from 'drizzle-orm'
import type { Database } from '../client'
import { games, type Game, type GameInsert } from '../schema'

/**
 * Create a new game
 * @param hostDid - Host DID (null if created on TV, set when first player joins)
 */
export async function createGame(
  db: Database,
  hostDid: string | null,
  timerDuration: number = 60
): Promise<Game> {
  // Generate a random 6-character game ID
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase()

  const now = Math.floor(Date.now() / 1000)

  const gameData: GameInsert = {
    id: gameId,
    hostDid,
    status: 'lobby',
    timerDuration,
    currentRound: 0,
    totalPlayers: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(games).values(gameData)

  const result = await db.select().from(games).where(eq(games.id, gameId)).get()
  if (!result) {
    throw new Error('Failed to create game')
  }

  return result
}

/**
 * Start game - sets total_players and status to 'playing'
 */
export async function startGame(
  db: Database,
  gameId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  await db
    .update(games)
    .set({
      status: 'playing',
      currentRound: 0,
      roundStartTime: now,
      updatedAt: now,
    })
    .where(eq(games.id, gameId))
}


/**
 * Get game by ID
 */
export async function getGameById(db: Database, gameId: string): Promise<Game | undefined> {
  return await db.select().from(games).where(eq(games.id, gameId)).get()
}

/**
 * Update game status
 */
export async function updateGameStatus(
  db: Database,
  gameId: string,
  status: 'lobby' | 'playing' | 'finished'
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  await db
    .update(games)
    .set({ status, updatedAt: now })
    .where(eq(games.id, gameId))
}

/**
 * Update game
 */
export async function updateGame(
  db: Database,
  gameId: string,
  data: Partial<Game>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.update(games).set({ ...data, updatedAt: now }).where(eq(games.id, gameId))
}