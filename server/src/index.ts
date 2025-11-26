/**
 * Cloudflare Worker for draw-on-my-phone game
 * Handles REST API for game operations and WebSocket connections via Durable Objects
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import type { Env } from './types'
import { GameRoom } from './durable-object'
import { createDb } from './db/client'
import * as GameModel from './db/models/games'
import * as PlayerModel from './db/models/players'
import * as SubmissionModel from './db/models/submissions'
import { decodeAndVerifyJWT, getTaskType, isGameComplete } from '@internal/shared'

const app = new Hono<{ Bindings: Env }>()

// Enable CORS for all requests
app.use('/*', cors({
  origin: '*',
  credentials: true,
}))

/**
 * POST /api/game/create - Create a new game (for TV display)
 * No authentication required - first player to join becomes host
 */
app.post('/api/game/create', async (c) => {
  try {
    const body = await c.req.json()
    const { timerDuration = 60 } = body

    // Create database instance and create game
    const db = createDb(c.env.DB)

    // Create game with no host (hostDid = null)
    // First player to join will become the host
    const game = await GameModel.createGame(db, null, timerDuration)

    return c.json({
      gameId: game.id,
      game,
      players: [], // No players yet - game created on TV
    })
  } catch (error) {
    console.error('Create game error:', error)
    return c.json(
      { error: 'Failed to create game', message: (error as Error).message },
      500
    )
  }
})

/**
 * POST /api/game/:id/join - Join an existing game
 * Requires profileJwt for player authentication
 */
app.post('/api/game/:id/join', async (c) => {
  try {
    const gameId = c.req.param('id')
    const body = await c.req.json()
    const { profileJwt, avatarJwt } = body

    if (!profileJwt) {
      return c.json({ error: 'Missing profileJwt' }, 400)
    }

    // Verify and decode the profile JWT
    const profilePayload = await decodeAndVerifyJWT(profileJwt)
    const avatarPayload = avatarJwt ? await decodeAndVerifyJWT(avatarJwt) : null

    // Extract profile data
    const { did, name } = profilePayload.data as {
      did: string
      name: string
    }

    const avatar = avatarPayload?.data?.avatar || null

    // Create database instance
    const db = createDb(c.env.DB)

    const game = await GameModel.getGameById(db, gameId)

    if (!game) { // Check if game exists
      return c.json({ error: 'Game not found' }, 404)
    }

    // Check if player already exists in this game (idempotent join)
    const existingPlayer = await PlayerModel.getPlayerByDid(db, gameId, did)

    if (existingPlayer) {
      // Player already joined - return existing player data
      return c.json({ success: true, player: existingPlayer, alreadyJoined: true })
    }

    if (game.status !== 'lobby') { // If you are not an existing player, you can't join the game after it has started
      return c.json({ error: 'Cannot join game in progress' }, 400)
    }

    // Add new player (unique constraint on gameId+did prevents duplicates)
    const playerCount = await PlayerModel.countPlayers(db, gameId)
    const player = await PlayerModel.addPlayer(
      db,
      gameId,
      did,
      name,
      avatar,
      playerCount
    )

    // If this is the first player, make them the host
    if (playerCount === 0) {
      await GameModel.updateGame(db, gameId, {
        hostDid: did,
        updatedAt: Math.floor(Date.now() / 1000)
      })
    }

    // Notify all clients that a player has joined the game
    await notifyGameRoom(c, gameId, 'player_joined')

    return c.json({ success: true, player, alreadyJoined: false })
  } catch (error) {
    console.error('Join game error:', error)
    return c.json(
      { error: 'Failed to join game', message: (error as Error).message },
      500
    )
  }
})

/**
 * POST /api/game/:id/start - Start the game (host only)
 * Requires profileJwt to verify host
 */
app.post('/api/game/:id/start', async (c) => {
  try {
    const gameId = c.req.param('id')
    const body = await c.req.json()
    const { profileJwt } = body

    if (!profileJwt) {
      return c.json({ error: 'Missing profileJwt' }, 400)
    }

    // Verify and decode the profile JWT
    const profilePayload = await decodeAndVerifyJWT(profileJwt)
    const did = profilePayload.iss

    // Create database instance
    const db = createDb(c.env.DB)

    // Check if game exists
    const game = await GameModel.getGameById(db, gameId)
    if (!game) {
      return c.json({ error: 'Game not found' }, 404)
    }

    // Check if host is assigned (should be set when first player joins)
    if (!game.hostDid) {
      return c.json({ error: 'No host assigned yet - waiting for first player to join' }, 400)
    }

    // Verify caller is the host
    if (game.hostDid !== did) {
      return c.json({ error: 'Only the host can start the game' }, 403)
    }

    if (game.status !== 'lobby') { // Check game status
      return c.json({ error: 'Game has already started' }, 400)
    }

    // Count actual players to validate minimum requirement
    const playerCount = await PlayerModel.countPlayers(db, gameId)
    if (playerCount < 3) { // Check if game has enough players
      return c.json({ error: 'Need at least 3 players to start' }, 400)
    }

    // Start the game and set totalPlayers (immutable after this point)
    await GameModel.startGame(db, gameId, playerCount)

    // Notify Durable Object to load immutable data and broadcast
    await notifyGameRoom(c, gameId, 'game_started')

    return c.json({ success: true })
  } catch (error) {
    console.error('Start game error:', error)
    return c.json(
      { error: 'Failed to start game', message: (error as Error).message },
      500
    )
  }
})

/**
 * POST /api/game/:id/submit - Submit word/drawing/guess
 * Requires profileJwt for player authentication
 */
app.post('/api/game/:id/submit', async (c) => {
  try {
    const gameId = c.req.param('id')
    const body = await c.req.json()
    const { profileJwt, chainOwnerDid, type } = body

    if (!profileJwt) {
      return c.json({ error: 'Missing profileJwt' }, 400)
    }

    if (!chainOwnerDid || !type) {
      return c.json({ error: 'Missing chainOwnerDid or type' }, 400)
    }

    // Verify and decode the profile JWT
    const profilePayload = await decodeAndVerifyJWT(profileJwt)
    const submitterDid = profilePayload.iss

    // Create database instance
    const db = createDb(c.env.DB)

    // Get current game state
    const game = await GameModel.getGameById(db, gameId)
    if (!game) {
      return c.json({ error: 'Game not found' }, 404)
    }

    if (game.status !== 'playing') {
      return c.json({ error: 'Game not in progress' }, 400)
    }

    // Validate submission type matches expected task type
    const expectedTaskType = getTaskType(game.currentRound)
    if (type !== expectedTaskType) {
      return c.json({
        error: `Invalid submission type. Expected ${expectedTaskType}, got ${type}`
      }, 400)
    }

    // Check if player already submitted for this round
    const existingSubmission = await SubmissionModel.getSubmissionBySubmitter(
      db,
      gameId,
      game.currentRound,
      submitterDid
    )

    if (existingSubmission) {
      return c.json({ error: 'Already submitted for this round' }, 400)
    }

    // Create submission (content stored locally on device, not in database)
    await SubmissionModel.createSubmission(db, {
      gameId,
      chainOwnerDid,
      round: game.currentRound,
      submitterDid,
      type,
      createdAt: Math.floor(Date.now() / 1000)
    })

    // Check if round is complete (all players submitted)
    const submissionCount = await SubmissionModel.countSubmissionsByGameAndRound(
      db,
      gameId,
      game.currentRound
    )

    if (submissionCount === game.totalPlayers) {
      // All players submitted - advance round or finish game
      const nextRound = game.currentRound + 1

      if (isGameComplete(nextRound, game.totalPlayers || 0)) {
        // Game is complete
        await GameModel.updateGame(db, gameId, {
          status: 'finished',
          updatedAt: Math.floor(Date.now() / 1000)
        })
        await notifyGameRoom(c, gameId, 'game_ended')
      } else {
        // Advance to next round
        const now = Math.floor(Date.now() / 1000)
        await GameModel.updateGame(db, gameId, {
          currentRound: nextRound,
          roundStartTime: now,
          updatedAt: now
        })
        await notifyGameRoom(c, gameId, 'round_advanced')
      }
    } else {
      // Just one submission - broadcast without advancing round
      await notifyGameRoom(c, gameId, 'submission_received')
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Submit error:', error)
    return c.json(
      { error: 'Failed to submit', message: (error as Error).message },
      500
    )
  }
})

/**
 * Helper function to notify Durable Object (GameRoom) about game changes
 */
async function notifyGameRoom(
  c: Context<{ Bindings: Env }>,
  gameId: string,
  action: string
): Promise<void> {
  try {
    const doId = c.env.GAME_ROOM.idFromName(`game:${gameId}`)
    const gameRoom = c.env.GAME_ROOM.get(doId)

    await gameRoom.fetch(new Request(`http://do/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    }))
  } catch (err) {
    console.error('Error notifying GameRoom:', err)
  }
}

/**
 * GET /api/ws - WebSocket endpoint for real-time game updates
 * Forwards to game-specific Durable Object
 */
app.get('/api/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade')

  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426)
  }

  // Get gameId from query params
  const url = new URL(c.req.url)
  const gameId = url.searchParams.get('gameId')

  if (!gameId) {
    return c.text('Missing gameId parameter', 400)
  }

  // Forward WebSocket upgrade to game-specific Durable Object
  const doId = c.env.GAME_ROOM.idFromName(`game:${gameId}`)
  const gameRoom = c.env.GAME_ROOM.get(doId)

  return gameRoom.fetch(new Request(`http://do/ws?gameId=${gameId}`, {
    headers: c.req.raw.headers,
  }))
})

/**
 * GET / - Root endpoint (returns '😁', useful for health check)
 */
app.get('/', (c) => {
  return c.text('😁')
})

// Export Durable Object
export { GameRoom }

// Export Worker fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx)
  },
}
