/**
 * Shared types for Draw on my phone game
 * Used by both client and server
 */

export interface Game {
  id: string
  hostDid: string | null // Nullable - set when first player joins
  status: 'lobby' | 'playing' | 'finished'
  timerDuration: number
  currentRound: number
  roundStartTime: number | null
  totalPlayers: number | null
  createdAt: number
  updatedAt: number
}

export interface Player {
  id: number
  gameId: string
  did: string
  name: string
  avatar: string | null
  turnPosition: number
  createdAt: number
  updatedAt: number
}

export type TaskType = 'word' | 'draw' | 'guess'

// Submission records in database (tracks completion only, content stored on device)
export interface Submission {
  id: number
  gameId: string
  chainOwnerDid: string
  round: number
  submitterDid: string
  type: TaskType
  createdAt: number
}

/**
 * Server game state broadcast to all connected players
 * This is the shared state that all players see
 */
export interface ServerGameState {
  gameId: string
  status: 'lobby' | 'playing' | 'finished'
  hostDid: string | null // Nullable until first player joins
  players: Player[]
  currentRound: number
  roundStartTime: number | null
  timerDuration: number
  totalPlayers: number | null
}

/**
 * Lightweight game state update (no players array)
 * Sent during gameplay to reduce bandwidth
 */
export interface GameStateUpdate {
  gameId: string
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  roundStartTime: number | null
  hostDid: string | null // Nullable until first player joins
  timerDuration: number
  totalPlayers: number | null
}

/**
 * WebSocket message types
 */
export type WebSocketMessageType =
  | 'game_state_full'
  | 'game_state_update'
  | 'error'

export interface WebSocketMessage {
  type: WebSocketMessageType
  data: any
}

export interface GameStateFullMessage {
  type: 'game_state_full'
  data: ServerGameState
}

export interface GameStateUpdateMessage {
  type: 'game_state_update'
  data: GameStateUpdate
}

export interface ErrorMessage {
  type: 'error'
  data: {
    message: string
  }
}
