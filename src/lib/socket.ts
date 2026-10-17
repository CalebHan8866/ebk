import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  // Only create a new socket when there is none at all.
  // Do NOT recreate while the socket is disconnected-but-reconnecting — socket.io
  // manages that automatically, and tearing it down would cancel the pending retry.
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })
  }
  return socket
}

// Call this after login/logout so the next getSocket() creates a fresh
// connection and the server middleware re-reads the updated auth cookie.
export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
