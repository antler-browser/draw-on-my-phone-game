# Draw on my phone Game - Technical Implementation

## Architecture Overview

**Layer Separation Model**: REST API (Workers) handles all data mutations, Durable Objects handle real-time communication. Clients compute personalized views from shared state.

**Key Architecture Decisions:**
1. **REST API for coordination** - Server tracks completion only, not content
2. **Durable Objects for real-time** - WebSocket connections and broadcasts
3. **Immutable data pattern** - Load players/settings once when game starts
4. **Shared state broadcast** - Same message to all players, clients compute their view
5. **Local-only content** - All content (words, drawings, guesses) in localStorage, never uploaded
6. **Physical phone passing** - Each device stores its own chain, phones passed to view others
7. **Zustand for state** - Client-side state with computed getters and localStorage persistence

**Benefits:**
- Simple and clear separation of concerns
- Immutable data eliminates cache invalidation complexity
- Efficient broadcasting (one message to all players)
- Fast local-only drawings
- Shared game logic between client and server (/shared/)

**Cost note:** This architecture is ~50% cheaper than handling everything in Durable Objects, since Workers don't charge for duration while waiting on D1 queries.

---

## 1. Database Schema (D1) - Simplified

### games table

- `id` (text, primary key) - Unique game room ID
- `host_did` (text) - DID of host player
- `status` (text) - 'lobby' | 'playing' | 'finished'
- `timer_duration` (integer) - Seconds per turn (default: 60)
- `current_round` (integer) - Current round number (0-indexed)
- `total_players` (integer, nullable) - Total number of players (set when game starts, immutable)
- `created_at` (integer) - Unix timestamp

### players table

- `id` (integer, auto-increment)
- `game_id` (text, foreign key)
- `did` (text) - Player's DID
- `name` (text)
- `avatar` (text, nullable)
- `turn_position` (integer) - Position in turn rotation (0-indexed)
- `created_at` (integer) - Unix timestamp
- `updated_at` (integer) - Unix timestamp

### submissions table (completion tracking only)

- `id` (integer, auto-increment)
- `game_id` (text, foreign key)
- `chain_owner_did` (text) - Whose "phone" this submission belongs to
- `round` (integer) - Round number (0-indexed, round 0 = word selection)
- `submitter_did` (text) - Who made this submission
- `type` (text) - 'word' | 'draw' | 'guess'
- `created_at` (integer) - Unix timestamp

**Note:** Round 0 is always `type='word'` where each player selects their starting word for their own chain (chain_owner_did = submitter_did)

**Content storage:** ALL content (words, drawings, guesses) is stored locally on each device in localStorage. The submissions table only tracks completion for round progression coordination. No content is ever uploaded to the server.

---

## 2. Content Storage Strategy (Local-Only)

All game content (words, drawings, and guesses) is stored locally on each device and never uploaded. This authentically mirrors the physical Draw on my phone game where content stays on the physical booklet/phone.

### Storage Implementation with Zustand

**Zustand store with localStorage persistence:**
```typescript
// stores/gameStore.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { getTaskType, getChainOwnerPosition } from '@/shared/game-logic'

// Shared state broadcast by server (same for all players)
interface ServerGameState {
  gameId: string
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  players: Player[]
  hostDid: string
  timerDuration: number
  totalPlayers: number
  roundStartTime: number // Unix timestamp
}

interface GameStore {
  // Shared state from server (broadcast to all players)
  gameState: ServerGameState | null

  // Client-only state
  myDid: string // Player's DID (from JWT/IRL Browser profile)
  chainDrawings: Record<number, string> // round -> canvas JSON string
  chainSubmissions: Record<number, ChainData> // round -> submission metadata (words/guesses/drawings)
  wsConnection: WebSocket | null

  // Actions
  updateGameState: (partial: Partial<ServerGameState>) => void
  updateFullGameState: (state: ServerGameState) => void
  setMyDid: (did: string) => void
  saveDrawing: (round: number, data: string) => void
  getDrawing: (round: number) => string | undefined
  connectWebSocket: (url: string) => void
  disconnectWebSocket: () => void
  clearGame: () => void
  
  // Computed getters (derive personalized view from shared state)
  getMyPlayer: () => Player | undefined
  getMyChain: () => Player | undefined
  getMyTask: () => 'word' | 'draw' | 'guess' | null
  getDeadline: () => number
  isHost: () => boolean
}

export const useGameStore = create<GameStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        gameState: null,
        myDid: '',
        chainDrawings: {},
        wsConnection: null,
        
        // Actions
        updateGameState: (partial) => set(state => ({
          gameState: state.gameState ? { ...state.gameState, ...partial } : partial
        })),

        updateFullGameState: (newState) => set({ gameState: newState }),

        setMyDid: (did) => set({ myDid: did }),
        
        saveDrawing: (round, data) => {
          set(state => ({
            chainDrawings: { ...state.chainDrawings, [round]: data }
          }))
        },
        
        getDrawing: (round) => get().chainDrawings[round],
        
        connectWebSocket: (url) => {
          const ws = new WebSocket(url)
          
          ws.onmessage = (event) => {
            const message = JSON.parse(event.data)

            switch (message.type) {
              case 'game_state_full':
                // Full state replacement (includes players with avatars)
                get().updateFullGameState(message.data)
                break
              case 'game_state_update':
                // Partial update (lightweight, no players array)
                get().updateGameState(message.data)
                break
              case 'error':
                console.error('Game error:', message.data.message)
                break
            }
          }
          
          ws.onerror = (error) => console.error('WebSocket error:', error)
          ws.onclose = () => console.log('WebSocket closed')
          
          set({ wsConnection: ws })
        },
        
        disconnectWebSocket: () => {
          const ws = get().wsConnection
          if (ws) {
            ws.close()
            set({ wsConnection: null })
          }
        },
        
        clearGame: () => {
          set({ gameState: null, chainDrawings: {}, myDid: '' })
          get().disconnectWebSocket()
        },
        
        // Computed getters
        getMyPlayer: () => {
          const { gameState, myDid } = get()
          if (!gameState || !myDid) return undefined
          return gameState.players.find(p => p.did === myDid)
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
          if (!gameState) return null
          
          // Use shared game logic
          return getTaskType(gameState.currentRound, gameState.players.length)
        },
        
        getDeadline: () => {
          const { gameState } = get()
          if (!gameState) return 0
          return gameState.roundStartTime + gameState.timerDuration
        },
        
        isHost: () => {
          const { gameState, myDid } = get()
          return gameState?.hostDid === myDid
        }
      }),
      {
        name: 'draw-on-my-phone-storage', // localStorage key
        partialize: (state) => ({ 
          chainDrawings: state.chainDrawings, // Only persist drawings
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
export const selectCurrentRound = (state: GameStore) => state.gameState?.currentRound ?? 0
export const selectGameStatus = (state: GameStore) => state.gameState?.status
export const selectIsHost = (state: GameStore) => state.isHost()
```

**Usage in components:**
```typescript
// DrawingView.tsx
import { useGameStore, selectMyTask, selectDeadline } from '@/stores/gameStore'

const DrawingView = () => {
  // Use selectors for computed state
  const myTask = useGameStore(selectMyTask)
  const deadline = useGameStore(selectDeadline)
  const myChain = useGameStore(state => state.getMyChain())
  
  // Actions
  const saveDrawing = useGameStore(state => state.saveDrawing)
  const wsConnection = useGameStore(state => state.wsConnection)
  
  const handleSubmit = () => {
    const saveData = canvasRef.current.getSaveData()
    saveDrawing(currentRound, saveData)
    
    wsConnection?.send(JSON.stringify({
      type: 'submit_drawing',
      data: { chainOwnerDid: myChain?.did, content: null }
    }))
  }
  
  return <Canvas onSubmit={handleSubmit} />
}

// GameLobby.tsx - only host sees start button
const GameLobby = () => {
  const isHost = useGameStore(selectIsHost)
  const players = useGameStore(state => state.gameState?.players ?? [])
  
  return (
    <div>
      <PlayerList players={players} />
      {isHost && <StartGameButton />}
    </div>
  )
}
```

**Data format:**
- Canvas data from `react-canvas-draw`: `canvasRef.current.getSaveData()`
- Returns JSON string with vector paths: `'{"lines":[{"points":[...],"brushColor":"#000"}]}'`
- Typical size: 20-200KB per drawing (vector, not raster)
- Storage per game: ~250KB for 6-player game ✅ Well within localStorage limits

**Persistence:**
- Primary: Zustand store (in-memory, fast access, reactive updates)
- Backup: localStorage via `persist` middleware (survives refresh, tab close)
- Cleanup: Call `clearGame()` right before starting a new game to clear both store and localStorage (this is the only time the store is cleared)
- Selective persistence: Only `chainDrawings` persisted, not transient state like WebSocket connection

**Benefits of Zustand:**
- ✅ No Provider wrapping needed
- ✅ Minimal boilerplate (~100 lines for entire store)
- ✅ Built-in DevTools support
- ✅ Automatic localStorage sync with `persist` middleware
- ✅ Selective re-renders (components only update when their selected state changes)
- ✅ Perfect for WebSocket integration
- ✅ Small bundle size (~1KB gzipped)

---

## 3. Backend Structure

### REST API Layer (Workers) - Data Layer

**Responsibilities:**
- Accept all user-initiated actions (create, join, start, submit)
- Validate requests (JWT verification, permissions, game state)
- Execute all D1 queries (INSERT, UPDATE, SELECT)
- Compute game logic (round advancement, completion checks)
- Notify Durable Objects to broadcast state changes

**Key Endpoints:**

**POST /api/game/create**
```typescript
async function createGame(req) {
  const { profileJwt, timerDuration = 60 } = await req.json()

  // Verify JWT and extract DID
  const profile = verifyJWT(profileJwt)
  const hostDid = profile.did

  const gameId = generateId()

  await db.query(`
    INSERT INTO games (id, host_did, status, timer_duration, current_round, created_at, updated_at)
    VALUES (?, ?, 'lobby', ?, 0, ?, ?)
  `, [gameId, hostDid, timerDuration, Date.now(), Date.now()])

  return { gameId }
}
```

**POST /api/game/:id/join**
```typescript
async function joinGame(req) {
  const { gameId } = req.params
  const { profileJwt } = await req.json()
  
  // Verify JWT
  const profile = verifyJWT(profileJwt)
  
  // Verify game is in lobby (can't join after game starts)
  const game = await db.query('SELECT status FROM games WHERE id = ?', [gameId])
  if (game.status !== 'lobby') {
    throw new Error('Cannot join game in progress')
  }
  
  // Get current player count for turn_position
  const count = await db.query(
    'SELECT COUNT(*) as count FROM players WHERE game_id = ?',
    [gameId]
  )
  
  // Insert player
  await db.query(`
    INSERT INTO players (game_id, did, name, avatar, turn_position, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [gameId, profile.did, profile.name, profile.avatar, count.count, Date.now()])
  
  // Notify DO to broadcast (players will be loaded when game starts)
  await notifyDO(gameId, 'broadcast')
  
  return { success: true }
}
```

**POST /api/game/:id/start**
```typescript
async function startGame(req) {
  const { gameId } = req.params
  const { profileJwt } = await req.json()

  // Verify JWT and extract DID
  const profile = verifyJWT(profileJwt)
  const did = profile.did

  // Verify host
  const game = await db.query('SELECT host_did FROM games WHERE id = ?', [gameId])
  if (game.host_did !== did) throw new Error('Only host can start')

  // Count players and update game to playing, set round 0
  const playerCount = await db.query(
    'SELECT COUNT(*) as count FROM players WHERE game_id = ?',
    [gameId]
  )

  const now = Date.now()
  await db.query(`
    UPDATE games
    SET status = 'playing', current_round = 0, round_start_time = ?, total_players = ?, updated_at = ?
    WHERE id = ?
  `, [now, playerCount.count, now, gameId])

  // Notify DO - triggers loading immutable data (hostDid, timerDuration, totalPlayers)
  await notifyDO(gameId, 'game_started')

  return { success: true }
}
```

**POST /api/game/:id/submit**
```typescript
async function submitAction(req) {
  const { gameId } = req.params
  const { profileJwt, chainOwnerDid, type } = await req.json() // No content sent

  // Verify JWT and extract DID
  const profile = verifyJWT(profileJwt)
  const did = profile.did

  // Get current game state
  const game = await db.query('SELECT current_round, status, total_players FROM games WHERE id = ?', [gameId])
  if (game.status !== 'playing') throw new Error('Game not in progress')

  // Insert submission (completion tracking only, no content)
  await db.query(`
    INSERT INTO submissions
    (game_id, chain_owner_did, round, submitter_did, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [gameId, chainOwnerDid, game.current_round, did, type, Date.now()])

  // Check if round is complete
  const submissions = await db.query(
    'SELECT COUNT(*) as count FROM submissions WHERE game_id = ? AND round = ?',
    [gameId, game.current_round]
  )

  // If all players submitted, advance round
  if (submissions.count === game.total_players) {
    const nextRound = game.current_round + 1

    // Check if game is complete
    if (nextRound >= game.total_players) {
      await db.query(
        'UPDATE games SET status = ?, updated_at = ? WHERE id = ?',
        ['finished', Date.now(), gameId]
      )
      await notifyDO(gameId, 'game_ended')
    } else {
      const now = Date.now()
      await db.query(`
        UPDATE games
        SET current_round = ?, round_start_time = ?, updated_at = ?
        WHERE id = ?
      `, [nextRound, now, now, gameId])

      await notifyDO(gameId, 'round_advanced')
    }
  } else {
    // Just one submission - broadcast without reloading anything
    await notifyDO(gameId, 'broadcast')
  }

  return { success: true }
}
```

**Immutable Data Pattern - No Invalidation Needed:**
- Players join during lobby only → players array immutable once game starts
- Timer duration set at creation → never changes
- Host DID set at creation → never changes
- Total players set when game starts → never changes
- DO loads scalar immutable data (hostDid, timerDuration, totalPlayers) ONCE when game starts
- Players array queried when needed (not stored in memory due to large base64 avatars)
- Only mutable fields (status, currentRound, roundStartTime) change during gameplay

**Helper: Notify Durable Object**
```typescript
async function notifyDO(gameId: string, action: string) {
  const doId = env.GAME_ROOM.idFromName(`game:${gameId}`)
  const gameRoom = env.GAME_ROOM.get(doId)
  
  await gameRoom.fetch(new Request(`http://do/${action}`, {
    method: 'POST',
    body: JSON.stringify({ gameId })
  }))
}
```

### Durable Object: GameRoom class - Communication Layer

**Responsibilities:**
- Manage WebSocket connections
- Broadcast state changes to connected clients
- Handle alarm-triggered timeouts
- Store immutable game data (loaded once, never changes)

**In-memory state:**
```typescript
{
  // Essential
  gameId: string
  connections: Map<did, WebSocket>

  // Immutable data (loaded once when game starts)
  hostDid: string | null
  timerDuration: number | null
  totalPlayers: number | null
}
```

**Note:** Players array is NOT stored in memory (avatars can be large base64 strings). Query from D1 when needed for broadcasts and alarms.

**Broadcast Optimization Strategy:**

The architecture uses a two-tier broadcast approach to minimize bandwidth:

1. **`broadcastInitialState()`** - Sends full state including players array with base64 avatars (~200KB)
   - Called when: Client connects, lobby changes, game starts
   - Frequency: 1-2 times per game per client

2. **`broadcastState()`** - Sends only mutable fields, no players array (~500 bytes)
   - Called when: Round advances, game ends, alarm fires
   - Frequency: Every round (6+ times per game)

**Benefits:**
- ✅ **400x bandwidth reduction** per round update (200KB → 500 bytes)
- ✅ **Faster updates** - No D1 players query during gameplay
- ✅ **Better scalability** - Reduced D1 load and DO memory
- ✅ **Reconnect handling** - New clients get full state, existing clients get updates only
- ✅ **Cost savings** - Fewer D1 reads (~50% reduction during gameplay)

**Example bandwidth usage (6-player, 6-round game):**
- Old approach: 6 rounds × 200KB = 1.2MB per client
- New approach: 1 full (200KB) + 6 updates (3KB) = 203KB per client
- **Savings: 83% bandwidth reduction**

**Immutable Data Pattern:**
- Players can only join during `status='lobby'`
- Once game starts, players array is frozen (immutable in D1)
- Timer duration set at game creation, never changes
- Host DID set at game creation, never changes
- Total players set when game starts, never changes

**Query strategy:**
```
Game starts → Load hostDid, timerDuration, totalPlayers → Store in DO memory
             → Never query these fields again
             → Players NOT stored (avatars are large base64)

Each broadcast → Query mutable fields (status, currentRound, roundStartTime)
              → Query players (with avatars) for client display
              → Combine with immutable data from memory

Each alarm → Query mutable fields (status, currentRound)
          → Query players (only did, turn_position - no avatars)
          → Combine with immutable data from memory
```

**Key methods:**

**fetch() - Handle internal notifications from REST API**
```typescript
async fetch(request: Request) {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/broadcast':
      // During lobby: players may have changed → send full state to all
      // During game: only submissions changed → send lightweight update
      const game = await this.db.query('SELECT status FROM games WHERE id = ?', [this.gameId])
      if (game.status === 'lobby') {
        await this.broadcastInitialState()  // Send players array (lobby changes)
      } else {
        await this.broadcastState()  // Lightweight update (no players)
      }
      break

    case '/game_started':
      // Game started - load immutable data ONCE, send full state (last time with players)
      await this.loadImmutableData()
      await this.scheduleAlarm()
      await this.broadcastInitialState()  // Full state with players
      break

    case '/round_advanced':
      // Round advanced - lightweight update only (no players query)
      await this.scheduleAlarm()
      await this.broadcastState()  // Lightweight update
      break

    case '/game_ended':
      await this.storage.deleteAlarm()
      await this.broadcastState()  // Lightweight update
      await this.closeAllConnections()
      break
  }

  return new Response('OK')
}
```
```

**webSocketMessage() - Handle WebSocket connections from clients**
```typescript
async webSocketMessage(ws: WebSocket, message: string) {
  const msg = JSON.parse(message)

  switch (msg.type) {
    case 'connect':
      // Register connection
      const { did } = msg.data
      this.connections.set(did, ws)

      // Send full state to THIS client only (reconnect/initial connect)
      // Other clients don't need the players array re-sent
      await this.broadcastInitialState(ws)
      break
  }
}
```

**broadcastInitialState(targetWs?: WebSocket) - Send full state with players**
```typescript
async broadcastInitialState(targetWs?: WebSocket) {
  // Query mutable fields
  const game = await this.db.query(
    'SELECT status, current_round, round_start_time FROM games WHERE id = ?',
    [this.gameId]
  )

  // Query players WITH avatars (large base64 strings)
  const players = await this.db.query(
    'SELECT * FROM players WHERE game_id = ? ORDER BY turn_position',
    [this.gameId]
  )

  // Full state including players array
  const fullState = {
    gameId: this.gameId,
    status: game.status,
    currentRound: game.current_round,
    roundStartTime: game.round_start_time,
    players: players, // ~200KB with avatars
    hostDid: this.hostDid,
    timerDuration: this.timerDuration,
    totalPlayers: this.totalPlayers
  }

  const message = JSON.stringify({ type: 'game_state_full', data: fullState })

  if (targetWs) {
    // Send to specific client only (reconnect scenario)
    targetWs.send(message)
  } else {
    // Broadcast to all clients (lobby or game start)
    for (const ws of this.connections.values()) {
      ws.send(message)
    }
  }
}
```

**broadcastState() - Send lightweight state updates (no players)**
```typescript
async broadcastState() {
  // Query only mutable fields (fast, small query)
  const game = await this.db.query(
    'SELECT status, current_round, round_start_time FROM games WHERE id = ?',
    [this.gameId]
  )

  // NO players query - clients already have players from broadcastInitialState()
  const stateUpdate = {
    gameId: this.gameId,
    status: game.status,
    currentRound: game.current_round,
    roundStartTime: game.round_start_time,
    // Immutable scalars from memory (tiny overhead)
    hostDid: this.hostDid,
    timerDuration: this.timerDuration,
    totalPlayers: this.totalPlayers
  }

  const message = JSON.stringify({ type: 'game_state_update', data: stateUpdate })

  // Broadcast to all connected players (~500 bytes vs ~200KB!)
  for (const ws of this.connections.values()) {
    ws.send(message)
  }
}
```

**loadImmutableData() - Called once when game starts**
```typescript
async loadImmutableData() {
  if (this.hostDid !== null) return // Already loaded

  const game = await this.db.query(
    'SELECT host_did, timer_duration, total_players FROM games WHERE id = ?',
    [this.gameId]
  )

  // Store immutable data in memory (no players array - queried when needed)
  this.hostDid = game.host_did
  this.timerDuration = game.timer_duration
  this.totalPlayers = game.total_players
}
```

**alarm() - Auto-timeout handler (MUST stay in DO)**
```typescript
async alarm() {
  console.log(`⏰ Alarm fired for game ${this.gameId}`)
  
  // Query only mutable fields
  const game = await this.db.query(
    'SELECT status, current_round FROM games WHERE id = ?',
    [this.gameId]
  )
  
  if (game.status !== 'playing') return
  
  // Find players who haven't submitted
  const submissions = await this.db.query(
    'SELECT submitter_did FROM submissions WHERE game_id = ? AND round = ?',
    [this.gameId, game.current_round]
  )
  
  const submittedDids = new Set(submissions.map(s => s.submitter_did))

  // Query players (only need did and turn_position, not avatars)
  const players = await this.db.query(
    'SELECT did, turn_position FROM players WHERE game_id = ? ORDER BY turn_position',
    [this.gameId]
  )

  // Auto-submit for missing players (using immutable total_players count)
  const taskType = getTaskType(game.current_round, this.totalPlayers)

  for (const player of players) {
    if (!submittedDids.has(player.did)) {
      const chainOwnerPos = getChainOwnerPosition(
        player.turn_position,
        game.current_round,
        this.totalPlayers
      )
      const chainOwner = players[chainOwnerPos]

      await this.db.query(`
        INSERT INTO submissions
        (game_id, chain_owner_did, round, submitter_did, type, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [this.gameId, chainOwner.did, game.current_round, player.did, taskType, null, Date.now(), Date.now()])
    }
  }
  
  // Advance round
  const nextRound = game.current_round + 1

  if (nextRound >= this.totalPlayers) {
    // Game finished
    await this.db.query(
      'UPDATE games SET status = ?, updated_at = ? WHERE id = ?',
      ['finished', Date.now(), this.gameId]
    )
  } else {
    // Next round
    const now = Date.now()
    await this.db.query(`
      UPDATE games 
      SET current_round = ?, round_start_time = ?, updated_at = ?
      WHERE id = ?
    `, [nextRound, now, now, this.gameId])
    
    // Schedule next alarm
    await this.scheduleAlarm()
  }
  
  // Broadcast updated state
  await this.broadcastState()
}
```

**scheduleAlarm() - Schedule next timeout**
```typescript
async scheduleAlarm() {
  // Query only roundStartTime (mutable field)
  const game = await this.db.query(
    'SELECT round_start_time FROM games WHERE id = ?',
    [this.gameId]
  )
  
  // Use immutable timerDuration from memory
  const deadline = game.round_start_time + (this.timerDuration * 1000)
  await this.storage.setAlarm(deadline)
}
```

**Key principle:** Scalar immutable data (hostDid, timerDuration, totalPlayers) loaded ONCE when game starts and stored in memory. Players array queried when needed (not cached due to large avatars). Only mutable fields (status, currentRound, roundStartTime) change during gameplay. No cache invalidation needed!

---

## 4. Timer Architecture & Durable Object Alarms

### Hybrid Timer Model: Client Shows, Server Enforces

**Division of Responsibility:**

**Client (UI/UX):**
- Server broadcasts `roundStartTime` and `timerDuration`
- Client calculates deadline: `deadline = roundStartTime + timerDuration`
- Client shows countdown timer (updates every 100ms)
- Optional: Client can auto-submit when timer hits 0 (optimization)
- **Client is NOT authoritative** - just displays time

**Server (Authority):**
- Server schedules Durable Object Alarm when round starts
- Alarm fires automatically at exact deadline
- Server auto-submits for players who haven't submitted
- Server advances round when all submissions complete
- **Server is authoritative** - enforces timeout

**Benefits:**
- ✅ Good UX: Players see countdown
- ✅ Reliable: Game can't get stuck if client disconnects
- ✅ Efficient: No server polling needed
- ✅ Clock skew tolerant: Server time is authoritative

### Implementation

**Server: Schedule Alarm on Round Start**
```typescript
async advanceRound() {
  const now = Date.now()
  
  // Load timer duration from D1 (or cache once at game start)
  const game = await this.db.query('SELECT timer_duration FROM games WHERE id = ?', [this.gameId])
  const timerDuration = game.timer_duration // seconds
  
  // Update D1 (source of truth)
  await this.db.query(
    'UPDATE games SET current_round = ?, round_start_time = ?, updated_at = ? WHERE id = ?',
    [this.currentRound + 1, now, now, this.gameId]
  )
  
  this.currentRound++
  
  // Schedule Durable Object Alarm for auto-timeout
  const deadline = now + (timerDuration * 1000) // milliseconds
  await this.storage.setAlarm(deadline)
  
  console.log(`Round ${this.currentRound} started, alarm set for ${new Date(deadline)}`)
  
  // Broadcast new state to all clients
  await this.broadcastState()
}
```

**Server: Alarm Handler (Auto-Timeout)**
```typescript
// Called automatically when alarm fires
async alarm() {
  console.log(`⏰ Alarm fired for game ${this.gameId}, round ${this.currentRound}`)
  
  // Verify game is still in playing state
  if (this.status !== 'playing') {
    console.log('Game not playing, skipping alarm')
    return
  }
  
  // Find players who haven't submitted yet
  const submissions = await this.db.query(
    'SELECT submitter_did FROM submissions WHERE game_id = ? AND round = ?',
    [this.gameId, this.currentRound]
  )
  
  const players = await this.getPlayers()
  const submittedDids = new Set(submissions.map(s => s.submitter_did))
  const taskType = this.getTaskType(this.currentRound, players.length)
  
  // Auto-submit for missing players
  for (const player of players) {
    if (!submittedDids.has(player.did)) {
      const chainOwner = this.getChainOwnerDid(player.turnPosition, this.currentRound)
      
      console.log(`Auto-submitting for player ${player.name} (timed out)`)
      
      // Auto-submit with empty content
      await this.db.query(
        'INSERT INTO submissions (game_id, chain_owner_did, round, submitter_did, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [this.gameId, chainOwner, this.currentRound, player.did, taskType, null, Date.now(), Date.now()]
      )
    }
  }
  
  // Check if round is now complete (should be!)
  const totalSubmissions = await this.db.query(
    'SELECT COUNT(*) as count FROM submissions WHERE game_id = ? AND round = ?',
    [this.gameId, this.currentRound]
  )
  
  if (totalSubmissions.count === players.length) {
    console.log('All players submitted (after timeout), advancing round')
    await this.advanceRound()
  }
}
```

**Client: Calculate Deadline from Round Start Time**
```typescript
// stores/gameStore.ts (Zustand)
getDeadline: () => {
  const { gameState } = get()
  if (!gameState) return 0
  
  // Client-side calculation for UI
  return gameState.roundStartTime + (gameState.timerDuration * 1000)
}
```

**Client: Countdown Timer Component**
```typescript
// components/GameTimer.tsx
import { useGameStore } from '@/stores/gameStore'
import { useState, useEffect } from 'react'

const GameTimer = () => {
  const deadline = useGameStore(state => state.getDeadline())
  const [timeLeft, setTimeLeft] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now())
      setTimeLeft(remaining)
      
      if (remaining === 0) {
        clearInterval(interval)
      }
    }, 100) // Update every 100ms for smooth countdown
    
    return () => clearInterval(interval)
  }, [deadline])
  
  const totalSeconds = Math.floor(timeLeft / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  
  const isWarning = totalSeconds < 10
  
  return (
    <div className={`timer ${isWarning ? 'warning' : ''}`}>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  )
}
```

### Alarm Lifecycle

```
Round starts → storage.setAlarm(deadline)
                     ↓
         Alarm scheduled in DO storage
                     ↓
         Players submit their drawings
                     ↓
              Time passes...
                     ↓
   ┌─────────────────┴──────────────────┐
   │                                    │
   ↓                                    ↓
All submitted                    Alarm fires (timeout)
   │                                    │
   ↓                                    ↓
advanceRound()                   Auto-submit + advanceRound()
(delete alarm)                          │
   │                                    │
   └─────────────────┬──────────────────┘
                     ↓
            Next round starts
            New alarm scheduled
```

**Alarm Persistence:**
- ✅ Alarms survive DO hibernation
- ✅ If DO restarts mid-round, alarm still fires
- ✅ Alarm state stored in Durable Object's persistent storage

**Canceling Alarms (Early Round Completion):**

If round advances before timeout (all players submitted early):
```typescript
async handleSubmission(did, chainOwnerDid, content, type) {
  // Save submission...
  
  // Check if round complete
  if (allPlayersSubmitted) {
    // Clear the alarm since we don't need timeout anymore
    await this.storage.deleteAlarm()
    
    // Advance to next round (which sets a new alarm)
    await this.advanceRound()
  }
}
```

This prevents the alarm from firing unnecessarily when the round has already advanced.

---

## 5. API Routes (server/src/index.ts)

**Game Management (REST API):**
- `POST /api/game/create` - Create new game, return gameId
- `POST /api/game/:id/join` - Join game (requires JWT), notifies DO to broadcast
- `POST /api/game/:id/start` - Host starts game, triggers loading immutable data
- `POST /api/game/:id/submit` - Submit completion notification (no content), handles round advancement
- `GET /api/game/:id/state` - Get full game state from D1

**WebSocket Connection:**
- `GET /api/game/:id/ws` - Upgrade to WebSocket, handled by Durable Object

**Flow:**
```
Client → REST API (Worker) → D1 query → Notify DO → Broadcast via WebSocket
```

**Architecture reasoning:**
- Clear separation: data operations (REST) vs real-time communication (WebSocket)
- All game logic and validation in one place (REST API)
- DO focuses solely on broadcasting to connected clients

---

## 6. WebSocket Messages

### Client → Server

**Only connection management via WebSocket:**
```typescript
{ type: 'connect', data: { did } } // Register WebSocket connection
{ type: 'disconnect', data: { did } } // Unregister connection
```

**All game actions go through REST API (completion notifications only):**
- Word selection: `POST /api/game/:id/submit` (word stored locally, completion sent)
- Drawing submission: `POST /api/game/:id/submit` (drawing stored locally, completion sent)
- Guess submission: `POST /api/game/:id/submit` (guess stored locally, completion sent)

### Server → Client

**State broadcasts (optimized two-tier approach):**
```typescript
// Full state with players array (sent once on connect or during lobby)
{ type: 'game_state_full', data: FullGameState }

// Lightweight updates (sent on round changes, no players array)
{ type: 'game_state_update', data: GameStateUpdate }

// Error messages
{ type: 'error', data: { message } }
```

**When each message type is sent:**
- `game_state_full`: Client connects, during lobby when players join, game starts
- `game_state_update`: Round advances, game ends, timeout alarm fires

### State Structures

**FullGameState** (sent via `game_state_full` - includes large players array with base64 avatars):

```typescript
{
  gameId: string
  status: 'lobby' | 'playing' | 'finished'
  hostDid: string
  players: Player[] // All players with turnPosition, name, avatar (base64), did
  currentRound: number
  timerDuration: number
  totalPlayers: number // Total number of players (immutable once game starts)
  roundStartTime: number // Unix timestamp when current round started
}
```

**GameStateUpdate** (sent via `game_state_update` - lightweight, no players array):

```typescript
{
  gameId: string
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  roundStartTime: number // Unix timestamp when current round started
  // Immutable scalars (small, sent for convenience)
  hostDid: string
  timerDuration: number
  totalPlayers: number
  // NO players array! Client already has it from game_state_full
}
```

**Bandwidth comparison:**
- `game_state_full`: ~200KB (with 6 players with avatars)
- `game_state_update`: ~500 bytes (400x smaller!)

**Note**: All state is broadcast to ALL players (same message). Each client computes their personalized view:
- `myPlayer` - Find player by matching `myDid` from JWT
- `myChain` - Use `getChainOwnerPosition(myTurnPosition, currentRound, playerCount)` 
- `myTask` - Use `getTaskType(currentRound, playerCount)`
- `deadline` - Calculate as `roundStartTime + timerDuration`

**Benefits of shared state:**
- Smaller payloads (one message instead of N personalized messages)
- Less server computation (no per-player view generation)
- Clients see consistent game state (easier debugging)
- Game logic in /shared/ is reusable and testable

**Why REST for actions:**
- Workers don't charge for duration (D1 query wait time is free)
- Easier to implement rate limiting, validation, logging
- Cleaner architecture: actions are stateless HTTP requests

---

## 7. Frontend Components

### New Components to Build:

#### GameLobby.tsx
- Show players who joined (with avatars)
- Host controls: timer settings, start button
- QR code for joining
- Wait screen for non-hosts

#### WordSelection.tsx
- Display 4 random words. Pick a category from ./word-list.json and then pick 1 word from that category, then pick 1 word from the remaining categories until you have 4 words.
- Single selection, submit button
- "Waiting for others" state

#### DrawingView.tsx
- react-canvas-draw component
- Color picker, brush size, eraser, clear
- Timer countdown
- Submit button (auto-submit on timeout)
- **Zustand storage with computed state:**
  ```typescript
  import { useGameStore, selectMyTask, selectMyChain, selectDeadline } from '@/stores/gameStore'
  
  const DrawingView = () => {
    // Computed state (client-side calculation from shared state)
    const myTask = useGameStore(selectMyTask)
    const myChain = useGameStore(selectMyChain)
    const deadline = useGameStore(selectDeadline)
    const currentRound = useGameStore(state => state.gameState?.currentRound)
    const gameId = useGameStore(state => state.gameState?.gameId)
    const myDid = useGameStore(state => state.myDid)
    
    // Actions
    const saveDrawing = useGameStore(state => state.saveDrawing)
    
    const handleSubmit = async () => {
      const saveData = canvasRef.current.getSaveData()
      saveDrawing(currentRound, saveData) // Saves to Zustand + localStorage
      
      // Submit via REST API (not WebSocket)
      await fetch(`/api/game/${gameId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          did: myDid,
          chainOwnerDid: myChain?.did,
          type: 'draw',
          content: null // Drawing stored locally
        })
      })
      
      // REST API will notify DO to broadcast updated state
      // Client receives update via WebSocket
    }
    
    return <Canvas deadline={deadline} onSubmit={handleSubmit} />
  }
  ```
- **No upload delays** - instant transition to PassPhoneView

#### GuessView.tsx
- Display previous drawing from Zustand store
- **Load drawing with computed state:**
  ```typescript
  import { useGameStore, selectMyChain } from '@/stores/gameStore'
  
  const GuessView = () => {
    const currentRound = useGameStore(state => state.gameState?.currentRound)
    const myChain = useGameStore(selectMyChain)
    const getDrawing = useGameStore(state => state.getDrawing)
    const gameId = useGameStore(state => state.gameState?.gameId)
    const myDid = useGameStore(state => state.myDid)
    
    useEffect(() => {
      // Load the previous drawing from this chain
      const previousDrawing = getDrawing(currentRound - 1)
      if (previousDrawing && canvasRef.current) {
        canvasRef.current.loadSaveData(previousDrawing)
      }
    }, [currentRound])
    
    const handleSubmit = async (guessText: string) => {
      // Submit via REST API
      await fetch(`/api/game/${gameId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          did: myDid,
          chainOwnerDid: myChain?.did,
          type: 'guess',
          content: guessText
        })
      })
    }
    
    return (
      <div>
        <Canvas readOnly />
        <input type="text" placeholder="What do you see?" />
        <button onClick={() => handleSubmit(inputValue)}>Submit</button>
      </div>
    )
  }
  ```
- Read-only canvas (no drawing tools)
- Text input for guess
- Timer countdown
- Submit button

#### PassPhoneView.tsx
- Interstitial screen: "Pass your phone to [Player Name] →"
- Shows whose phone this is: "This is [Owner]'s phone"
- "I have the phone" button (recipient clicks)
- Simple transition state (no upload waiting needed)

#### ChainReveal.tsx
- **Shows only the chain on this device** (mimics physical Draw on my phone booklets)
- Display full chain: word → drawing → guess → drawing → final guess
- Load drawings from Zustand store: `useGameStore(state => state.getDrawing(round))`
- Vertical scroll with each step
- Header: "This is [Owner]'s chain!" 
- **To see other chains:** Physically pass phones around the group
- "Play again" button:
  ```typescript
  const clearGame = useGameStore(state => state.clearGame)
  // Clears Zustand store + localStorage
  ```

#### GameTimer.tsx
- Circular progress bar
- Countdown (MM:SS)
- Warning color at <10 seconds

### Component Hierarchy:

```
App.tsx
├─ GameLobby (status='lobby')
├─ GamePlay (status='playing')
│  ├─ WordSelection (currentRound === 0)
│  ├─ PassPhoneView (waiting for recipient)
│  ├─ DrawingView (myTask='draw')
│  └─ GuessView (myTask='guess')
└─ ChainReveal (status='finished')
```

**State Management Architecture:**

**Shared state** (broadcast from server, same for all players):
- `gameState.status`, `gameState.currentRound`, `gameState.players`, etc.
- Retrieved via: `useGameStore(state => state.gameState)`

**Computed state** (personalized view calculated client-side):
- `myPlayer` - `useGameStore(state => state.getMyPlayer())`
- `myChain` - `useGameStore(selectMyChain)` 
- `myTask` - `useGameStore(selectMyTask)`
- `deadline` - `useGameStore(selectDeadline)`
- `isHost` - `useGameStore(selectIsHost)`

**Client-only state** (never sent to server):
- `chainDrawings` - Canvas data stored locally
- `myDid` - Player identity from JWT

**Key benefit**: All components use the same shared state, compute their personalized view using /shared/ game logic. No Provider wrapping needed - components import and use the store directly.

---

## 8. Game Flow State Machine

### Phase 1: Lobby

- Players join via QR code
- Host configures timer
- Host starts when 3-8 players joined

### Phase 2: Word Selection (Round 0, status='playing')

- Show 5 random words to each player
- Each player selects 1 word (creates round 0 submission with type='word')
- This becomes the starting word for their own chain
- Transition to round 1 when all players submitted

### Phase 3: Playing (Rounds 1+)

**Odd number of players:**
- Round 1: Draw the word (first drawing round)
- Round 2+: Alternate guess/draw until N rounds complete (total rounds = player count)

**Even number of players:**
- Round 1: Guess the word (first guess round)
- Round 2+: Alternate draw/guess until N rounds complete (total rounds = player count)

**Chain rotation logic:**

After each round:
- Player receives chain from previous player
- Chain[i] goes to Player[(turn_position + 1) % playerCount]

**Task determination:**

```typescript
// Round 0 is always word selection
if (currentRound === 0) {
  task = 'word'
} else {
  const isEvenPlayers = playerCount % 2 === 0
  
  // For odd players: round 1 = draw, round 2 = guess, etc.
  // For even players: round 1 = guess, round 2 = draw, etc.
  const isDrawRound = isEvenPlayers
    ? (currentRound % 2 === 0)  // even players: rounds 2,4,6 are draw
    : (currentRound % 2 === 1)  // odd players: rounds 1,3,5 are draw
  
  task = isDrawRound ? 'draw' : 'guess'
}
```

### Phase 4: Reveal (status='finished')

- All chains returned to original owners
- Browse all chains
- See full progression

---

## 9. Key Algorithms

### Determining Round Count

```typescript
// Total rounds = player count
// Round 0 = word selection
// Rounds 1 to N-1 = draw/guess alternating
// Each chain ends up with N submissions total (1 word + N-1 draw/guess)

const totalRounds = playerCount

// Game is complete when currentRound >= playerCount
function isGameComplete(currentRound, playerCount) {
  return currentRound >= playerCount
}
```

### Chain Assignment

```typescript
// Each player IS their own chain (their phone)
// Chain owner = player who owns the phone
// Starting word = round 0 submission (type='word') for that chain owner

// Get all submissions for a specific chain (phone):
function getChainSubmissions(chainOwnerDid, gameId) {
  return db.query(`
    SELECT * FROM submissions 
    WHERE game_id = ? AND chain_owner_did = ?
    ORDER BY round ASC
  `, [gameId, chainOwnerDid])
  // First result will be the starting word (round 0, type='word')
}

// Determine which player currently has which chain (phone):
function getMyCurrentChain(myTurnPosition, currentRound, playerCount) {
  // Chains rotate each round
  // I receive the chain from the player (currentRound) positions behind me
  const chainOwnerTurnPosition = (myTurnPosition - currentRound + playerCount) % playerCount
  return players[chainOwnerTurnPosition] // This player's phone is what I'm working on
}
```

### Who Can See What?

- Players only see the last submission in their current chain
- Cannot see earlier steps until reveal phase
- Backend filters submissions when sending game_state

---

## 10. Shared Package (/shared/)

### shared/src/types.ts
- All TypeScript interfaces used by both client and server:
  - `Game` - game metadata (maps to games table)
  - `Player` - includes `name`, `avatar`, `turnPosition`, `did`
  - `Submission` - includes `chainOwnerDid`, `submitterDid`, `type` ('word' | 'draw' | 'guess')
  - `ServerGameState` - shared state broadcast to all players
  - `Chain` (derived type) - computed from Player + their Submissions (starting word is round 0 submission)
  - `Task` - type alias for `'word' | 'draw' | 'guess'`
- WebSocket message types (client→server and server→client)
- **Separation of concerns**:
  - Types in /shared/ define the data structures
  - Functions in /shared/game-logic.ts compute derived state
  - Server and client both import from /shared/ for consistency

### shared/src/jwt.ts
- JWT verification (Ed25519 signature validation)
- Same as before

### shared/src/words.ts
- Word list (500+ words/phrases)
- `getRandomWords(count: number): string[]`

### shared/src/game-logic.ts
- Pure functions for game rules (used by both server and client):
  ```typescript
  // Determine what type of task the current round requires
  export function getTaskType(
    round: number, 
    playerCount: number
  ): 'word' | 'draw' | 'guess' {
    if (round === 0) return 'word'
    
    const isEvenPlayers = playerCount % 2 === 0
    const isDrawRound = isEvenPlayers
      ? (round % 2 === 0)  // even players: rounds 2,4,6 are draw
      : (round % 2 === 1)  // odd players: rounds 1,3,5 are draw
    
    return isDrawRound ? 'draw' : 'guess'
  }
  
  // Determine which chain (phone) a player currently has
  export function getChainOwnerPosition(
    myTurnPosition: number,
    currentRound: number,
    playerCount: number
  ): number {
    // Chains rotate each round
    // I receive the chain from the player (currentRound) positions behind me
    return (myTurnPosition - currentRound + playerCount) % playerCount
  }
  
  // Determine which player should have which chain
  export function getNextChainHolder(
    currentHolderPosition: number, 
    playerCount: number
  ): number {
    return (currentHolderPosition + 1) % playerCount
  }
  
  // Check if game is complete
  export function isGameComplete(
    currentRound: number,
    playerCount: number
  ): boolean {
    return currentRound >= playerCount
  }
  
  // Get total number of rounds
  export function getTotalRounds(playerCount: number): number {
    return playerCount // Round 0 through N-1
  }
  ```
- **Key principle**: These functions are pure (no side effects) and used by both client and server
- **Client use**: Compute personalized view from shared state
- **Server use**: Validate game logic and state transitions

---

## 11. Durable Object Lifecycle & Cleanup

### One Durable Object Per Game

Each game gets its own isolated Durable Object instance:
```typescript
// Game ID → DO ID mapping
const gameId = "abc123"
const doId = env.GAME_ROOM.idFromName(`game:${gameId}`)
const gameRoom = env.GAME_ROOM.get(doId)
```

**Benefits:**
- ✅ Isolation: Each game is independent
- ✅ Scalability: Cloudflare handles 1000s of concurrent games
- ✅ Clean lifecycle: DO lives with the game
- ✅ No cross-contamination: Game A can't affect Game B

### Game Lifecycle

```
┌─────────────────────────────────────────────────────┐
│ 1. Game Created (status='lobby')                    │
│    - DO spawns on first connection                  │
│    - Loads initial state from D1                    │
│    - WebSocket connections keep it alive            │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 2. Game Active (status='playing')                   │
│    - Players sending/receiving messages             │
│    - Alarms scheduled for timeouts                  │
│    - Cost: Active duration charges                  │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 3. Game Ends (status='finished')                    │
│    - Update D1: status='finished'                   │
│    - Broadcast final state to all players           │
│    - Close all WebSocket connections                │
│    - connections.clear()                            │
│    - Delete any pending alarms                      │
└──────────────────┬──────────────────────────────────┘
                   ↓
                ~30 seconds of inactivity
                   ↓
┌─────────────────────────────────────────────────────┐
│ 4. DO Hibernates Automatically                      │
│    - Memory cleaned up                              │
│    - Cost: $0 (no charges while hibernating)        │
│    - D1 keeps all game data (source of truth)       │
│    - Alarms persist (will still fire if scheduled)  │
└──────────────────┬──────────────────────────────────┘
                   ↓ (if someone reconnects)
┌─────────────────────────────────────────────────────┐
│ 5. DO Wakes Up (Cold Start)                         │
│    - Loads state from D1                            │
│    - Sees status='finished'                         │
│    - Sends final state, then closes connection      │
│    - Goes back to hibernation                       │
│    - Cold start: ~10-50ms (fast!)                   │
└─────────────────────────────────────────────────────┘
```

### Explicit Cleanup Implementation

```typescript
// In GameRoom Durable Object
async endGame(reason: 'complete' | 'timeout' | 'host_ended') {
  console.log(`Ending game ${this.gameId}: ${reason}`)
  
  // 1. Update D1 (source of truth)
  await this.db.query(
    'UPDATE games SET status = ?, updated_at = ? WHERE id = ?',
    ['finished', Date.now(), this.gameId]
  )
  
  this.status = 'finished'
  
  // 2. Delete any pending alarms
  await this.storage.deleteAlarm()
  
  // 3. Broadcast final state to all players
  await this.broadcastState()
  
  // 4. Close all WebSocket connections gracefully
  const closeMessage = JSON.stringify({
    type: 'game_ended',
    data: { reason }
  })
  
  for (const [did, ws] of this.connections) {
    ws.send(closeMessage)
    ws.close(1000, 'Game ended')
  }
  
  // 5. Clear all connections
  this.connections.clear()
  
  // DO will automatically hibernate after ~30s of no activity
}
```

## Architecture Benefits

**Simplicity & Clarity:**
- ✅ Clear separation: REST API (data) vs Durable Objects (real-time)
- ✅ Immutable data pattern - no cache invalidation logic
- ✅ ~300 fewer lines of code vs R2 approach
- ✅ No pre-signed URLs, CORS, or upload error handling
- ✅ Easier testing - mock layers independently

**Performance:**
- ✅ Zero upload delays - instant phone passing
- ✅ Fast gameplay on any connection speed
- ✅ Shared state broadcasting - one message to all players
- ✅ Client-side computation is lightweight (modulo operations)
- ✅ Immutable data = consistent query performance

**Developer Experience:**
- ✅ Zustand: minimal boilerplate, no Provider hell
- ✅ Zustand DevTools for debugging
- ✅ Automatic localStorage persistence
- ✅ Type-safe state access
- ✅ Shared game logic in /shared/ - DRY principle
- ✅ Pure functions are easy to test
- ✅ No cache invalidation bugs

**Scalability:**
- ✅ Workers auto-scale infinitely
- ✅ DO stays lightweight (only connections + immutable data)
- ✅ All players see consistent core state
- ✅ Faster DO cold starts (less code)
- ✅ Reduced D1 load (query only mutable fields)

**Social Experience:**
- ✅ Physical phone passing at reveal (true to IRL Browser)
- ✅ Group gathers around to see chains together
- ✅ Mimics physical Draw on my phone booklets

**Privacy:**
- ✅ All content (words, drawings, guesses) never leaves the device
- ✅ Zero server storage of user-generated content
- ✅ Auto-cleanup when game ends (localStorage only)

**Cost Efficiency:**
- ✅ ~50% cheaper than all-in-DO approach (Workers don't charge for duration while waiting on D1)
- ✅ No R2 storage costs for drawings

**Trade-offs:**
- ❌ Refresh during game can lose drawings (mitigated by localStorage)
- ❌ Can't view all chains on one device at reveal
- ❌ Can't share chains digitally after game
- ❌ Doesn't work for remote play (requires physical proximity)
- ❌ Can't allow late joins after game starts (matches physical game rules)
