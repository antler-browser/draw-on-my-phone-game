import { DurableObject } from 'cloudflare:workers'
import type { Env } from './types'

/**
 * Broadcaster Durable Object
 *
 * Manages real-time WebSocket connections for meetup attendees.
 * Uses WebSocket Hibernation API for efficient connection management.
 *
 * Features:
 * - Single instance per deployment (idFromName: 'default')
 * - Broadcasts user-joined/user-left events to all connected clients
 * - Auto-shutdown after 2 hours of inactivity
 * - Persists meetup start time in Durable Object storage
 */
export class Broadcaster extends DurableObject<Env> {
  private lastActivity: number
  private meetupStartTime: number

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)

    this.lastActivity = Date.now()
    this.meetupStartTime = Date.now()

    // Load meetup start time from storage (persists across DO restarts)
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<number>('meetupStartTime')
      if (stored) {
        this.meetupStartTime = stored
        console.log('Loaded meetup start time:', new Date(stored).toISOString())
      } else {
        await this.ctx.storage.put('meetupStartTime', this.meetupStartTime)
        console.log('Initialized meetup start time:', new Date(this.meetupStartTime).toISOString())
      }
    })
  }

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

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.handleWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Broadcast endpoint (called by Worker after DB operations)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const { event, data } = await request.json<{ event: string; data: any }>()
        this.broadcast(event, data)
        return new Response('OK')
      } catch (err) {
        console.error('Error handling broadcast:', err)
        return new Response('Invalid request', { status: 400 })
      }
    }

    return new Response('Not found', { status: 404 })
  }

  /**
   * Handle new WebSocket connection
   */
  private handleWebSocket(webSocket: WebSocket): void {
    // Accept the WebSocket using Hibernation API
    this.ctx.acceptWebSocket(webSocket)

    this.lastActivity = Date.now()
    const connectionCount = this.ctx.getWebSockets().length

    console.log(`New WebSocket connection (total: ${connectionCount})`)

    // Send initial connection message
    const message = {
      type: 'connected',
      timestamp: new Date().toISOString(),
      connectionCount,
    }

    try {
      webSocket.send(JSON.stringify(message))
    } catch (err) {
      console.error('Error sending connection message:', err)
    }

    // Schedule alarm check
    this.scheduleAlarm()
  }

  /**
   * Handle incoming WebSocket messages
   * (Currently unused, but can be used for heartbeat pings, etc.)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.lastActivity = Date.now()

    // Optionally handle client messages here
    // For example, heartbeat pings:
    // if (message === 'ping') {
    //   ws.send('pong')
    // }
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
    this.lastActivity = Date.now()
    const connectionCount = this.ctx.getWebSockets().length

    console.log(`WebSocket closed (code: ${code}, remaining: ${connectionCount})`)

    // If no more connections, schedule shutdown check
    if (connectionCount === 0) {
      console.log('No more connections, scheduling shutdown check')
      this.scheduleAlarm()
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  /**
   * Broadcast an event to all connected WebSocket clients
   */
  private broadcast(event: string, data: any): void {
    const message = JSON.stringify({ type: event, data })
    const connections = this.ctx.getWebSockets()

    console.log(`Broadcasting ${event} to ${connections.length} clients`)

    connections.forEach((ws) => {
      try {
        ws.send(message)
      } catch (err) {
        console.error(`Error sending to client:`, err)
      }
    })

    this.lastActivity = Date.now()
  }

  /**
   * Schedule an alarm for auto-shutdown checks
   * Checks every 30 minutes
   */
  private async scheduleAlarm(): Promise<void> {
    // Schedule alarm for 30 minutes from now
    const alarmTime = Date.now() + 30 * 60 * 1000
    await this.ctx.storage.setAlarm(alarmTime)
    console.log('Scheduled alarm for:', new Date(alarmTime).toISOString())
  }

  /**
   * Alarm handler - checks if meetup should be ended
   */
  async alarm(): Promise<void> {
    const now = Date.now()
    const idleTime = now - this.lastActivity
    const totalTime = now - this.meetupStartTime
    const connectionCount = this.ctx.getWebSockets().length

    console.log('Alarm triggered:', {
      idleTime: Math.round(idleTime / 1000 / 60) + ' minutes',
      totalTime: Math.round(totalTime / 1000 / 60) + ' minutes',
      connectionCount,
    })

    // Idle timeout: 2 hours of inactivity
    if (connectionCount === 0 && idleTime > 2 * 60 * 60 * 1000) {
      console.log('Meetup ended: 2 hours idle with no connections')
      this.broadcast('meetup-ended', {
        reason: 'idle',
        message: 'Meetup ended due to inactivity'
      })
      // Clear storage to allow fresh start if someone reconnects later
      await this.ctx.storage.deleteAll()
      return
    }

    // Still active, schedule next check
    this.scheduleAlarm()
  }

  /**
   * Close all WebSocket connections
   */
  private closeAllConnections(): void {
    const connections = this.ctx.getWebSockets()
    console.log(`Closing ${connections.length} connections`)

    connections.forEach((ws) => {
      try {
        ws.close(1000, 'Meetup ended')
      } catch (err) {
        console.error('Error closing connection:', err)
      }
    })
  }
}
