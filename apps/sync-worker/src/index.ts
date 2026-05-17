/**
 * Cloudflare Worker with Durable Objects
 * Acts as the centralized WebSocket signaling server and Yjs document sync relay.
 * This broadcasts binary Yjs updates and JSON WebRTC signaling data to all clients in a room.
 */

export interface Env {
  WHITEBOARD_ROOM: DurableObjectNamespace;
}

export class WhiteboardRoom {
  state: DurableObjectState;
  sessions: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // Create the WebSocket pair for the client and the server (Durable Object)
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection in the Durable Object state
    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    server.addEventListener('message', (event) => {
      // Broadcast the incoming message (Yjs binary update or WebRTC signal) 
      // to all other active WebSocket sessions in this specific room.
      for (const session of this.sessions) {
        if (session !== server) {
          try {
            session.send(event.data);
          } catch (error) {
            // If sending fails (e.g., disconnected before close event fired), remove the session
            this.sessions.delete(session);
          }
        }
      }
    });

    const closeOrErrorHandler = () => {
      this.sessions.delete(server);
    };

    server.addEventListener('close', closeOrErrorHandler);
    server.addEventListener('error', closeOrErrorHandler);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Route: wss://sync.yourdomain.com/room/<roomId>
    if (pathParts[0] === 'room' && pathParts[1]) {
      const roomId = pathParts[1];
      
      // Derive a unique Durable Object ID from the Room ID
      const id = env.WHITEBOARD_ROOM.idFromName(roomId);
      const roomObject = env.WHITEBOARD_ROOM.get(id);
      
      // Forward the WebSocket upgrade request to the Durable Object instance
      return roomObject.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};