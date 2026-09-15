import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/constants/Config';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  /** True while the socket is connected; flips to false in background / on network loss */
  connected: boolean;
  /**
   * Incremented on every (re)connect after the first one. Screens use it as a signal to
   * refetch, since events emitted while the app was disconnected are lost.
   */
  reconnectCount: number;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false, reconnectCount: 0 });

/**
 * Keeps one socket.io connection alive for the signed-in user. The server authenticates
 * with the same JWT as the REST API (handshake.auth.token) and puts the socket into the
 * user:<id> / company:<id> rooms, so appointment events arrive here without subscribing.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    if (!token || !API_URL) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      auth: { token },
    });
    socketRef.current = s;
    setSocket(s);

    let hadFirstConnect = false;
    s.on('connect', () => {
      setConnected(true);
      if (hadFirstConnect) setReconnectCount((n) => n + 1);
      hadFirstConnect = true;
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => console.log('[socket] connect_error:', err.message));

    // iOS suspends sockets in the background; make sure we come back promptly on foreground
    // instead of waiting for the next scheduled reconnection attempt.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !s.connected) s.connect();
    });

    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return <SocketContext.Provider value={{ socket, connected, reconnectCount }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Subscribes to one socket event for the lifetime of the component. The latest handler
 * is always used, so callers don't need to memoize it.
 */
export function useSocketEvent<T = any>(event: string, handler: (data: T) => void) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (data: T) => handlerRef.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
