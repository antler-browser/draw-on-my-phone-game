import { DurableObject } from 'cloudflare:workers'
import type { Env } from './types'
import { createDb } from './db/client'
import { getGameById, updateGame } from './db/models/games'
import { getPlayersByGameId } from './db/models/players'
import {
  getSubmissionsByGameAndRound,
  createSubmission
} from './db/models/submissions'
import type { ServerGameState, GameStateUpdate } from '@internal/shared'
import { getTaskType, getChainOwnerPosition, isGameComplete } from '@internal/shared'

/**
 * Immutable game data stored once when game starts
 */
interface GameData {
  gameId: string
  hostDid: string
  timerDuration: number
  totalPlayers: number
}

/**
 * GameRoom Durable Object
 *
 * Manages real-time WebSocket connections for a single game room.
 * Uses WebSocket Hibernation API for efficient, low-cost connection management.
 *
 * Features:
 * - One Durable Object instance per game (idFromName: `game:${gameId}`)
 * - Broadcasts game state updates to all connected players
 * - Automatic eviction by Cloudflare when all connections close
 * - D1 database is the source of truth (DO stores minimal state)
 * - Immutable game data stored in ctx.storage once at game start (survives hibernation)
 */
export class GameRoom extends DurableObject<Env> {
  /**
   * Handle incoming requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade endpoint
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 })
      }

      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      await this.handleWebSocket(server, gameId)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Broadcast endpoint (called by Worker after player joins/leaves during lobby)
    if (url.pathname === '/player_joined' && request.method === 'POST') {
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }
      try {
        await this.broadcastInitialState(gameId)
        return new Response('OK')
      } catch (err) {
        console.error('Broadcast error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Game started endpoint (called when host starts the game)
    if (url.pathname === '/game_started' && request.method === 'POST') {
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }
      try {
        // Load and persist all immutable data once
        const db = createDb(this.env.DB)
        const game = await getGameById(db, gameId)
        if (!game) {
          return new Response('Game not found', { status: 404 })
        }

        if (!game.hostDid || !game.timerDuration || !game.totalPlayers) {
          return new Response('Missing game data', { status: 400 })
        }

        const gameData: GameData = {
          gameId,
          hostDid: game.hostDid,
          timerDuration: game.timerDuration,
          totalPlayers: game.totalPlayers!
        }
        
        await this.ctx.storage.put('gameData', gameData)

        await this.scheduleAlarm(gameId)
        await this.broadcastInitialState(gameId)
        return new Response('OK')
      } catch (err) {
        console.error('Game started error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Round advanced endpoint (called when round advances)
    if (url.pathname === '/round_advanced' && request.method === 'POST') {
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }
      try {
        await this.scheduleAlarm(gameId)
        await this.broadcastState(gameId)
        return new Response('OK')
      } catch (err) {
        console.error('Round advanced error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Game ended endpoint (called when game finishes)
    if (url.pathname === '/game_ended' && request.method === 'POST') {
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }
      try {
        await this.ctx.storage.deleteAlarm()
        await this.broadcastState(gameId)
        await this.ctx.storage.deleteAll() // Clean up persisted gameId
        return new Response('OK')
      } catch (err) {
        console.error('Game ended error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Submission received endpoint (lightweight broadcast)
    if (url.pathname === '/submission_received' && request.method === 'POST') {
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId parameter', { status: 400 })
      }
      try {
        await this.broadcastState(gameId)
        return new Response('OK')
      } catch (err) {
        console.error('Submission received error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    return new Response('Not found', { status: 404 })
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleWebSocket(webSocket: WebSocket, gameId: string): Promise<void> {
    // Accept the WebSocket using Hibernation API
    this.ctx.acceptWebSocket(webSocket)

    // Send full game state to the connecting client
    await this.broadcastInitialState(gameId, webSocket)
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    // Check if this was the last connection
    const remainingConnections = this.ctx.getWebSockets()

    if (remainingConnections.length === 0) {
      const gameData = await this.ctx.storage.get<GameData>('gameData')
      if (gameData) {
        const db = createDb(this.env.DB)
        const game = await getGameById(db, gameData.gameId)

        // If game is still playing, clean up alarm to prevent unnecessary operations
        if (game && (game.status === 'playing' || game.status === 'finished')) {
          console.log(`All players disconnected from game ${gameData.gameId}, cleaning up alarm`)
          await this.ctx.storage.deleteAlarm()
        }
      }
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  /**
   * Broadcast full game state with players array
   * Called when: client connects, lobby changes, game starts
   */
  private async broadcastInitialState(gameId: string, targetWs?: WebSocket): Promise<void> {
    const db = createDb(this.env.DB)

    // Query current game state
    const game = await getGameById(db, gameId)
    if (!game) {
      console.error(`Game not found: ${gameId}`)
      return
    }

    // Query all players
    const players = await getPlayersByGameId(db, gameId)

    // Build full state
    const fullState: ServerGameState = {
      gameId: gameId,
      status: game.status as 'lobby' | 'playing' | 'finished',
      hostDid: game.hostDid,
      players: players,
      currentRound: game.currentRound,
      roundStartTime: game.roundStartTime,
      timerDuration: game.timerDuration,
      totalPlayers: game.totalPlayers,
    }

    const message = JSON.stringify({
      type: 'game_state_full',
      data: fullState,
    })

    if (targetWs) {
      // Send to specific client (reconnect scenario)
      try {
        targetWs.send(message)
      } catch (err) {
        console.error('Send error:', err)
      }
    } else {
      // Broadcast to all connected clients
      const connections = this.ctx.getWebSockets()
      connections.forEach((ws) => {
        try {
          ws.send(message)
        } catch (err) {
          console.error('Send error:', err)
        }
      })
    }
  }

  /**
   * Broadcast lightweight state update (no players array)
   * Called when: round advances, game ends, submission received
   */
  private async broadcastState(gameId: string): Promise<void> {
    const gameData = await this.ctx.storage.get<GameData>('gameData')

    const db = createDb(this.env.DB)
    const game = await getGameById(db, gameId)
    if (!game) {
      console.error(`Game not found: ${gameId}`)
      return
    }

    // Build lightweight state update (no players array)
    const stateUpdate: GameStateUpdate = {
      gameId: gameId,
      status: game.status as 'lobby' | 'playing' | 'finished',
      currentRound: game.currentRound,
      roundStartTime: game.roundStartTime,
      hostDid: gameData?.hostDid || game.hostDid,
      timerDuration: gameData?.timerDuration || game.timerDuration,
      totalPlayers: gameData?.totalPlayers || game.totalPlayers,
    }

    const message = JSON.stringify({
      type: 'game_state_update',
      data: stateUpdate,
    })

    // Broadcast to all connected clients
    const connections = this.ctx.getWebSockets()
    connections.forEach((ws) => {
      try {
        ws.send(message)
      } catch (err) {
        console.error('Send error:', err)
      }
    })
  }

  /**
   * Schedule alarm for round timeout
   */
  private async scheduleAlarm(gameId: string): Promise<void> {
    const gameData = await this.ctx.storage.get<GameData>('gameData')

    const db = createDb(this.env.DB)
    const game = await getGameById(db, gameId)

    if (!game || !game.roundStartTime) {
      console.error('Cannot schedule alarm: missing game or roundStartTime')
      return
    }

    // Calculate deadline (roundStartTime is in seconds, convert to milliseconds)
    const timerDuration = gameData?.timerDuration || game.timerDuration
    const deadline = (game.roundStartTime * 1000) + timerDuration * 1000

    await this.ctx.storage.setAlarm(deadline)
    console.log(`⏰ Alarm scheduled for game ${gameId} at ${new Date(deadline).toISOString()}`)
  }

  /**
   * Alarm handler - triggered when round timeout occurs
   */
  async alarm(): Promise<void> {
    // Load game data from storage
    const gameData = await this.ctx.storage.get<GameData>('gameData')
    if (!gameData) {
      console.error('Alarm fired but gameData not in storage')
      return
    }

    const { gameId, totalPlayers } = gameData
    console.log(`⏰ Alarm fired for game ${gameId}`)

    const db = createDb(this.env.DB)

    // Get current game state
    const game = await getGameById(db, gameId)
    if (!game || game.status !== 'playing') {
      console.log('Game not playing, skipping alarm')
      return
    }

    // Find players who haven't submitted
    const submissions = await getSubmissionsByGameAndRound(db, gameId, game.currentRound)
    const submittedDids = new Set(submissions.map(s => s.submitterDid))

    // Get all players
    const players = await getPlayersByGameId(db, gameId)

    // Determine task type for this round
    const taskType = getTaskType(game.currentRound)

    // Auto-submit for missing players
    for (const player of players) {
      if (!submittedDids.has(player.did)) {
        console.log(`Auto-submitting for player ${player.name} (timed out)`)

        // Calculate which chain this player is working on
        const chainOwnerPosition = getChainOwnerPosition(
          player.turnPosition,
          game.currentRound,
          players.length
        )
        const chainOwner = players.find(p => p.turnPosition === chainOwnerPosition)
        if (!chainOwner) {
          console.error(`Chain owner not found for position ${chainOwnerPosition}`)
          continue
        }

        // Create auto-submission for timeout
        await createSubmission(db, {
          gameId: gameId,
          chainOwnerDid: chainOwner.did,
          round: game.currentRound,
          submitterDid: player.did,
          type: taskType,
          createdAt: Math.floor(Date.now() / 1000)
        })
      }
    }

    // All players have now submitted (auto or manual) - advance round
    const nextRound = game.currentRound + 1

    if (isGameComplete(nextRound, totalPlayers)) {
      // Game is complete
      await updateGame(db, gameId, {
        status: 'finished',
        updatedAt: Math.floor(Date.now() / 1000)
      })
      await this.broadcastState(gameId)
      await this.ctx.storage.deleteAlarm()
      await this.ctx.storage.deleteAll() // Clean up persisted gameData
    } else {
      // Advance to next round
      const now = Math.floor(Date.now() / 1000)
      await updateGame(db, gameId, {
        currentRound: nextRound,
        roundStartTime: now,
        updatedAt: now
      })

      // Schedule next alarm
      await this.scheduleAlarm(gameId)

      // Broadcast new round state
      await this.broadcastState(gameId)
    }
  }
}
