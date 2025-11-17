import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ServerGameState, GameStateUpdate, Player, TaskType, Submission } from '@meetup/shared'
import { getTaskType, getChainOwnerPosition } from '@meetup/shared'

/**
 * Chain data structure for reveal phase
 * Maps chainOwnerDid to array of submissions in that chain
 */
export interface ChainData {
  round: number
  type: TaskType
  content: string | null
  submitterDid: string
  createdAt: number
}

/**
 * Drawing data structure with canvas dimensions
 */
export interface DrawingData {
  drawing: string // Canvas JSON data from react-canvas-draw
  width: number   // Canvas width when drawing was created
  height: number  // Canvas height when drawing was created
}

/**
 * Zustand store for Draw on my phone game state
 *
 * Architecture:
 * - Shared state from server (broadcast to all players via WebSocket)
 * - Client-only state (myDid, WebSocket connection)
 * - Computed getters (derive personalized view from shared state)
 */
interface GameStore {
  // Shared state from server (broadcast to all players)
  gameState: ServerGameState | null

  // Client-only state
  myDid: string
  wsConnection: WebSocket | null
  chainDrawings: Record<string, DrawingData> // `${gameId}:${myDid}:${round}` -> drawing with dimensions
  chainSubmissions: Record<string, ChainData> // `${gameId}:${myDid}:${round}` -> submission (word/guess metadata, stored locally)
  chains: Record<string, ChainData[]> | null // chainOwnerDid -> submissions (for reveal phase)

  // Actions
  updateFullGameState: (state: ServerGameState) => void
  updateGameState: (partial: Partial<GameStateUpdate>) => void
  setMyDid: (did: string) => void
  saveDrawing: (gameId: string, round: number, data: DrawingData) => void
  getDrawing: (gameId: string, round: number) => DrawingData | undefined
  saveSubmission: (gameId: string, round: number, type: TaskType, content: string | null, submitterDid: string) => void
  getSubmission: (gameId: string, round: number) => ChainData | undefined
  connectWebSocket: (gameId: string, baseUrl: string) => void
  disconnectWebSocket: () => void
  clearGame: (gameId?: string) => void
  fetchChains: (gameId: string) => Promise<void>

  // Computed getters (derive personalized view from shared state)
  getMyPlayer: () => Player | undefined
  getMyChain: () => Player | undefined
  getMyTask: () => TaskType | null
  getDeadline: () => number
  isHost: () => boolean
  getChainByOwner: (chainOwnerDid: string) => ChainData[] | undefined
}

export const useGameStore = create<GameStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        gameState: null,
        myDid: '',
        wsConnection: null,
        chainDrawings: {},
        chainSubmissions: {},
        chains: null,

        // Actions
        updateFullGameState: (newState) => set({ gameState: newState }),

        updateGameState: (partial) => set(state => ({
          gameState: state.gameState ? { ...state.gameState, ...partial } : state.gameState
        })),

        setMyDid: (did) => set({ myDid: did }),

        saveDrawing: (gameId, round, data) => {
          const { myDid } = get()
          if (!myDid) {
            console.error('Cannot save drawing: myDid is not set')
            return
          }
          const key = `${gameId}:${myDid}:${round}`
          set(state => ({
            chainDrawings: { ...state.chainDrawings, [key]: data }
          }))
        },

        getDrawing: (gameId, round) => {
          const { myDid } = get()
          if (!myDid) {
            console.error('Cannot get drawing: myDid is not set')
            return undefined
          }
          const key = `${gameId}:${myDid}:${round}`
          return get().chainDrawings[key]
        },

        saveSubmission: (gameId, round, type, content, submitterDid) => {
          const { myDid } = get()
          if (!myDid) {
            console.error('Cannot save submission: myDid is not set')
            return
          }
          const key = `${gameId}:${myDid}:${round}`
          set(state => ({
            chainSubmissions: {
              ...state.chainSubmissions,
              [key]: {
                round,
                type,
                content,
                submitterDid,
                createdAt: Date.now()
              }
            }
          }))
        },

        getSubmission: (gameId, round) => {
          const { myDid } = get()
          if (!myDid) {
            console.error('Cannot get submission: myDid is not set')
            return undefined
          }
          const key = `${gameId}:${myDid}:${round}`
          return get().chainSubmissions[key]
        },

        fetchChains: async (gameId) => {
          try {
            const response = await fetch(`/api/game/${gameId}/submissions`)

            if (!response.ok) {
              throw new Error('Failed to fetch chains')
            }

            const data = await response.json()
            set({ chains: data.chains })
          } catch (error) {
            console.error('Error fetching chains:', error)
            throw error
          }
        },

      connectWebSocket: (gameId, baseUrl) => {
        // Disconnect existing connection if any
        const existingWs = get().wsConnection
        if (existingWs) {
          existingWs.close()
        }

        // Construct WebSocket URL
        const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws'
        const wsHost = baseUrl.replace(/^https?:\/\//, '')
        const wsUrl = `${wsProtocol}://${wsHost}/api/ws?gameId=${gameId}`

        console.log('Connecting to WebSocket:', wsUrl)

        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('WebSocket connected')
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('WebSocket message:', message)

            switch (message.type) {
              case 'game_state_full':
                // Full state update with players array
                get().updateFullGameState(message.data)
                break

              case 'game_state_update':
                // Lightweight update (no players array)
                get().updateGameState(message.data)
                break

              case 'error':
                console.error('WebSocket error:', message.data.message)
                break

              default:
                console.warn('Unknown message type:', message.type)
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
        }

        ws.onclose = () => {
          console.log('WebSocket closed')
          set({ wsConnection: null })
        }

        set({ wsConnection: ws })
      },

      disconnectWebSocket: () => {
        const ws = get().wsConnection
        if (ws) {
          ws.close()
          set({ wsConnection: null })
        }
      },

      clearGame: (gameId) => {
        get().disconnectWebSocket()

        // If no gameId provided, clear everything
        if (!gameId) {
          set({ gameState: null, myDid: '', chainDrawings: {}, chainSubmissions: {}, chains: null })
          return
        }

        // Otherwise, clear only data for this specific game and myDid
        const state = get()
        const { myDid } = get()
        const prefix = myDid ? `${gameId}:${myDid}:` : `${gameId}:`

        const filteredDrawings: Record<string, DrawingData> = {}
        Object.entries(state.chainDrawings).forEach(([key, value]) => {
          if (!key.startsWith(prefix)) {
            filteredDrawings[key] = value
          }
        })

        const filteredSubmissions: Record<string, ChainData> = {}
        Object.entries(state.chainSubmissions).forEach(([key, value]) => {
          if (!key.startsWith(prefix)) {
            filteredSubmissions[key] = value
          }
        })

        set({
          gameState: null,
          chainDrawings: filteredDrawings,
          chainSubmissions: filteredSubmissions,
          chains: null
        })
      },

      // Computed getters
      getMyPlayer: () => {
        const { gameState, myDid } = get()
        if (!gameState || !myDid) return undefined
        return gameState.players.find(p => p.did === myDid)
      },

      getChainByOwner: (chainOwnerDid) => {
        const { chains } = get()
        if (!chains) return undefined
        return chains[chainOwnerDid]
      },

      getMyChain: () => {
        const { gameState } = get()
        const myPlayer = get().getMyPlayer()
        if (!myPlayer || !gameState) return undefined

        // Use shared game logic to compute which chain I'm working on
        const chainOwnerPosition = getChainOwnerPosition(
          myPlayer.turnPosition,
          gameState.currentRound,
          gameState.players.length
        )

        return gameState.players[chainOwnerPosition]
      },

      getMyTask: () => {
        const { gameState } = get()
        if (!gameState || gameState.status !== 'playing') return null

        // Use shared game logic
        return getTaskType(gameState.currentRound, gameState.players.length)
      },

      getDeadline: () => {
        const { gameState } = get()
        if (!gameState || !gameState.roundStartTime) return 0

        // Calculate deadline: roundStartTime (seconds) + timerDuration (seconds), convert to milliseconds
        return (gameState.roundStartTime * 1000) + (gameState.timerDuration * 1000)
      },

      isHost: () => {
        const { gameState, myDid } = get()
        return gameState?.hostDid === myDid && gameState?.hostDid !== null
      },
      }),
      {
        name: 'draw-on-my-phone-storage', // localStorage key
        partialize: (state) => ({
          chainDrawings: state.chainDrawings, // Persist drawings
          chainSubmissions: state.chainSubmissions, // Persist words/guesses
          myDid: state.myDid // Persist player identity
        })
      }
    ),
    { name: 'GameStore' } // DevTools name
  )
)

// Selectors (optional, for cleaner component code)
export const selectMyPlayer = (state: GameStore) => state.getMyPlayer()
export const selectMyChain = (state: GameStore) => state.getMyChain()
export const selectMyTask = (state: GameStore) => state.getMyTask()
export const selectDeadline = (state: GameStore) => state.getDeadline()
export const selectIsHost = (state: GameStore) => state.isHost()
export const selectGameStatus = (state: GameStore) => state.gameState?.status
export const selectPlayers = (state: GameStore) => state.gameState?.players ?? []
export const selectCurrentRound = (state: GameStore) => state.gameState?.currentRound ?? 0
export const selectChains = (state: GameStore) => state.chains
export const selectGameId = (state: GameStore) => state.gameState?.gameId

/**
 * Migration: Detect old localStorage format and wipe clean
 * Old formats:
 * - v0: Numeric keys (e.g., chainDrawings: {0: "...", 1: "..."})
 * - v1: gameId-scoped keys (e.g., chainDrawings: {"ABC123:0": "...", "ABC123:1": "..."})
 * New format: gameId+myDid-scoped keys (e.g., chainDrawings: {"ABC123:did:key:z123:0": "..."})
 */
function migrateLocalStorageIfNeeded() {
  try {
    const storageKey = 'draw-on-my-phone-storage'
    const rawData = localStorage.getItem(storageKey)

    if (!rawData) return // No data to migrate

    const data = JSON.parse(rawData)
    const state = data.state

    if (!state) return

    // Check if old format exists (keys without proper myDid scoping)
    const hasOldFormatDrawings = state.chainDrawings &&
      Object.keys(state.chainDrawings).some(key => {
        // Old format: numeric keys or single-colon keys (gameId:round)
        // New format: double-colon keys (gameId:did:key:z...:round)
        const colonCount = (key.match(/:/g) || []).length
        return colonCount < 2 // Less than 2 colons means old format
      })

    const hasOldFormatSubmissions = state.chainSubmissions &&
      Object.keys(state.chainSubmissions).some(key => {
        const colonCount = (key.match(/:/g) || []).length
        return colonCount < 2
      })

    if (hasOldFormatDrawings || hasOldFormatSubmissions) {
      console.warn('[Migration] Detected old localStorage format. Wiping clean to prevent data contamination.')
      localStorage.removeItem(storageKey)

      // Mark migration as complete
      localStorage.setItem('draw-on-my-phone-migrated', 'v2')
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate localStorage:', error)
    // On error, wipe clean to be safe
    localStorage.removeItem('draw-on-my-phone-storage')
  }
}

// Run migration on module load (once per page load)
if (typeof window !== 'undefined') {
  migrateLocalStorageIfNeeded()
}
