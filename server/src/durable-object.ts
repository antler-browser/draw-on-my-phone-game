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
 * - Immutable data pattern: loads hostDid, timerDuration, totalPlayers once when game starts
 */
export class GameRoom extends DurableObject<Env> {
  private gameId: string | null = null
  private hostDid: string | null = null
  private timerDuration: number | null = null
  private totalPlayers: number | null = null

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

      // Extract gameId from query params
      const gameId = url.searchParams.get('gameId')
      if (!gameId) {
        return new Response('Missing gameId', { status: 400 })
      }

      // Store gameId if not already set
      if (!this.gameId) {
        this.gameId = gameId
      }

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      await this.handleWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Broadcast endpoint (called by Worker after player joins/leaves during lobby)
    if (url.pathname === '/player_joined' && request.method === 'POST') {
      try {
        const { gameId } = await request.json<{ gameId: string }>()
        if (!this.gameId) {
          this.gameId = gameId
        } else if (this.gameId !== gameId) {
          console.error(`GameID mismatch in /player_joined: expected ${this.gameId}, got ${gameId}`)
          return new Response('GameID mismatch', { status: 400 })
        }
        await this.broadcastInitialState()
        return new Response('OK')
      } catch (err) {
        console.error('Broadcast error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Game started endpoint (called when host starts the game)
    if (url.pathname === '/game_started' && request.method === 'POST') {
      try {
        const { gameId } = await request.json<{ gameId: string }>()
        if (!this.gameId) {
          this.gameId = gameId
        } else if (this.gameId !== gameId) {
          console.error(`GameID mismatch in /game_started: expected ${this.gameId}, got ${gameId}`)
          return new Response('GameID mismatch', { status: 400 })
        }
        await this.loadImmutableData()
        await this.scheduleAlarm()
        await this.broadcastInitialState()
        return new Response('OK')
      } catch (err) {
        console.error('Game started error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Round advanced endpoint (called when round advances)
    if (url.pathname === '/round_advanced' && request.method === 'POST') {
      try {
        if (!this.gameId) {
          console.error('GameID not set in /round_advanced')
          return new Response('GameID not set', { status: 400 })
        }
        await this.scheduleAlarm()
        await this.broadcastState()
        return new Response('OK')
      } catch (err) {
        console.error('Round advanced error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Game ended endpoint (called when game finishes)
    if (url.pathname === '/game_ended' && request.method === 'POST') {
      try {
        if (!this.gameId) {
          console.error('GameID not set in /game_ended')
          return new Response('GameID not set', { status: 400 })
        }
        await this.ctx.storage.deleteAlarm()
        await this.broadcastState()
        return new Response('OK')
      } catch (err) {
        console.error('Game ended error:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    // Submission received endpoint (lightweight broadcast)
    if (url.pathname === '/submission_received' && request.method === 'POST') {
      try {
        if (!this.gameId) {
          console.error('GameID not set in /submission_received')
          return new Response('GameID not set', { status: 400 })
        }
        await this.broadcastState()
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
  private async handleWebSocket(webSocket: WebSocket): Promise<void> {
    // Accept the WebSocket using Hibernation API
    this.ctx.acceptWebSocket(webSocket)

    // Send full game state to the connecting client
    await this.broadcastInitialState(webSocket)
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

    if (remainingConnections.length === 0 && this.gameId) {
      const db = createDb(this.env.DB)
      const game = await getGameById(db, this.gameId)

      // If game is still playing, clean up alarm to prevent unnecessary operations
      if (game && (game.status === 'playing' || game.status === 'finished')) {
        console.log(`All players disconnected from game ${this.gameId}, cleaning up alarm`)
        await this.ctx.storage.deleteAlarm()
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
  private async broadcastInitialState(targetWs?: WebSocket): Promise<void> {
    if (!this.gameId) {
      console.error('Cannot broadcast: gameId not set')
      return
    }

    const db = createDb(this.env.DB)

    // Query current game state
    const game = await getGameById(db, this.gameId)
    if (!game) {
      console.error(`Game not found: ${this.gameId}`)
      return
    }

    // Query all players
    const players = await getPlayersByGameId(db, this.gameId)

    // Build full state
    const fullState: ServerGameState = {
      gameId: this.gameId,
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
   * Load immutable game data once when game starts
   * Called when: game transitions from lobby to playing
   */
  private async loadImmutableData(): Promise<void> {
    if (!this.gameId || this.hostDid !== null) {
      return // Already loaded
    }

    const db = createDb(this.env.DB)
    const game = await getGameById(db, this.gameId)

    if (!game) {
      console.error(`Game not found: ${this.gameId}`)
      return
    }

    // Store immutable scalar data in memory
    this.hostDid = game.hostDid
    this.timerDuration = game.timerDuration
    this.totalPlayers = game.totalPlayers

    console.log(`Loaded immutable data for game ${this.gameId}`)
  }

  /**
   * Broadcast lightweight state update (no players array)
   * Called when: round advances, game ends, submission received
   */
  private async broadcastState(): Promise<void> {
    if (!this.gameId) {
      console.error('Cannot broadcast: gameId not set')
      return
    }

    const db = createDb(this.env.DB)

    // Query only mutable fields
    const game = await getGameById(db, this.gameId)
    if (!game) {
      console.error(`Game not found: ${this.gameId}`)
      return
    }

    // Build lightweight state update (no players array)
    const stateUpdate: GameStateUpdate = {
      gameId: this.gameId,
      status: game.status as 'lobby' | 'playing' | 'finished',
      currentRound: game.currentRound,
      roundStartTime: game.roundStartTime,
      hostDid: this.hostDid || game.hostDid,
      timerDuration: this.timerDuration || game.timerDuration,
      totalPlayers: this.totalPlayers || game.totalPlayers,
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
  private async scheduleAlarm(): Promise<void> {
    if (!this.gameId) {
      console.error('Cannot schedule alarm: gameId not set')
      return
    }

    const db = createDb(this.env.DB)
    const game = await getGameById(db, this.gameId)

    if (!game || !game.roundStartTime) {
      console.error('Cannot schedule alarm: missing game or roundStartTime')
      return
    }

    // Calculate deadline (roundStartTime is in seconds, convert to milliseconds)
    const deadline = (game.roundStartTime * 1000) + (this.timerDuration || game.timerDuration) * 1000

    await this.ctx.storage.setAlarm(deadline)
    console.log(`⏰ Alarm scheduled for game ${this.gameId} at ${new Date(deadline).toISOString()}`)
  }

  /**
   * Alarm handler - triggered when round timeout occurs
   */
  async alarm(): Promise<void> {
    if (!this.gameId) {
      console.error('Alarm fired but gameId not set')
      return
    }

    console.log(`⏰ Alarm fired for game ${this.gameId}`)

    const db = createDb(this.env.DB)

    // Get current game state
    const game = await getGameById(db, this.gameId)
    if (!game || game.status !== 'playing') {
      console.log('Game not playing, skipping alarm')
      return
    }

    // Find players who haven't submitted
    const submissions = await getSubmissionsByGameAndRound(db, this.gameId, game.currentRound)
    const submittedDids = new Set(submissions.map(s => s.submitterDid))

    // Get all players
    const players = await getPlayersByGameId(db, this.gameId)

    // Determine task type for this round
    const taskType = getTaskType(game.currentRound, this.totalPlayers || game.totalPlayers || players.length)

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
        const chainOwner = players[chainOwnerPosition]

        // Create auto-submission for timeout
        await createSubmission(db, {
          gameId: this.gameId,
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

    if (isGameComplete(nextRound, this.totalPlayers || game.totalPlayers || players.length)) {
      // Game is complete
      await updateGame(db, this.gameId, {
        status: 'finished',
        updatedAt: Math.floor(Date.now() / 1000)
      })
      await this.ctx.storage.deleteAlarm()
      await this.broadcastState()
    } else {
      // Advance to next round
      const now = Math.floor(Date.now() / 1000)
      await updateGame(db, this.gameId, {
        currentRound: nextRound,
        roundStartTime: now,
        updatedAt: now
      })

      // Schedule next alarm
      await this.scheduleAlarm()

      // Broadcast new round state
      await this.broadcastState()
    }
  }
}
