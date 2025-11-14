import { DurableObject } from 'cloudflare:workers'
import type { Env } from './types'

/**
 * Broadcaster Durable Object
 *
 * Manages real-time WebSocket connections for meetup attendees.
 * Uses WebSocket Hibernation API for efficient, low-cost connection management.
 *
 * Features:
 * - Single instance per deployment (idFromName: 'default')
 * - Broadcasts user-joined/user-left events to all connected clients
 * - Automatic eviction by Cloudflare when all connections close
 * - D1 database is the source of truth (DO stores no state)
 */
export class Broadcaster extends DurableObject<Env> {
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
        console.error('Broadcast error:', err)
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

    // Send initial connection message
    const message = {
      type: 'connected',
      timestamp: new Date().toISOString(),
      connectionCount: this.ctx.getWebSockets().length,
    }

    webSocket.send(JSON.stringify(message))
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
    // Optional: Log for debugging
    // console.log(`WebSocket closed (code: ${code})`)
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

    connections.forEach((ws) => {
      try {
        ws.send(message)
      } catch (err) {
        console.error('Send error:', err)
      }
    })
  }
}
