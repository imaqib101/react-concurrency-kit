import { useState, useEffect, useRef, useCallback } from 'react';
import type { StreamStatus } from './useEventStream';

export interface UseWebSocketStreamOptions<TData = unknown, TSend = unknown> {
  url: string;
  protocols?: string | string[];
  autoConnect?: boolean;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  heartbeatTimeoutMs?: number;
  maxHistoryLength?: number;
  bufferWhileConnecting?: boolean;
  maxBufferedMessages?: number;
  parser?: (data: string) => TData;
  serializer?: (data: TSend) => string;
  onOpen?: (event: Event) => void;
  onMessage?: (data: TData, rawEvent: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

export interface UseWebSocketStreamReturn<TData, TSend> {
  status: StreamStatus;
  data: TData | null;
  history: TData[];
  error: Event | null;
  bufferedCount: number;
  send: (data: TSend) => boolean;
  connect: () => void;
  disconnect: () => void;
  clearHistory: () => void;
}

export function useWebSocketStream<TData = string, TSend = string | Record<string, unknown>>(
  options: UseWebSocketStreamOptions<TData, TSend>
): UseWebSocketStreamReturn<TData, TSend> {
  const {
    url,
    protocols,
    autoConnect = true,
    maxRetries = 5,
    initialRetryDelayMs = 1000,
    maxRetryDelayMs = 30000,
    heartbeatTimeoutMs = 45000,
    maxHistoryLength = 100,
    bufferWhileConnecting = true,
    maxBufferedMessages = 50,
  } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [data, setData] = useState<TData | null>(null);
  const [history, setHistory] = useState<TData[]>([]);
  const [error, setError] = useState<Event | null>(null);
  const [bufferedCount, setBufferedCount] = useState<number>(0);

  const statusRef = useRef<StreamStatus>(status);
  statusRef.current = status;

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyClosedRef = useRef<boolean>(false);
  const outboxBufferRef = useRef<string[]>([]);

  const connectRef = useRef<() => void>(() => {});

  const updateStatus = useCallback((nextStatus: StreamStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const handleRetry = useCallback(() => {
    if (isManuallyClosedRef.current) return;
    if (retryCountRef.current >= maxRetries) {
      updateStatus('closed');
      return;
    }

    const delay = Math.min(
      initialRetryDelayMs * Math.pow(2, retryCountRef.current) + Math.random() * 200,
      maxRetryDelayMs
    );
    retryCountRef.current += 1;

    retryTimeoutRef.current = setTimeout(() => {
      connectRef.current();
    }, delay);
  }, [initialRetryDelayMs, maxRetries, maxRetryDelayMs, updateStatus]);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
    }
    if (heartbeatTimeoutMs > 0) {
      heartbeatTimerRef.current = setTimeout(() => {
        if (wsRef.current && statusRef.current === 'open') {
          wsRef.current.close();
          updateStatus('error');
          handleRetry();
        }
      }, heartbeatTimeoutMs);
    }
  }, [heartbeatTimeoutMs, updateStatus, handleRetry]);

  const flushOutbox = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    while (outboxBufferRef.current.length > 0) {
      const msg = outboxBufferRef.current.shift();
      if (msg !== undefined) {
        wsRef.current.send(msg);
      }
    }
    setBufferedCount(0);
  }, []);

  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    updateStatus('closed');
  }, [updateStatus]);

  const connect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    isManuallyClosedRef.current = false;
    updateStatus('connecting');
    setError(null);

    try {
      const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = (e) => {
        retryCountRef.current = 0;
        updateStatus('open');
        resetHeartbeat();
        flushOutbox();
        optionsRef.current.onOpen?.(e);
      };

      ws.onmessage = (e) => {
        resetHeartbeat();
        try {
          const parser = optionsRef.current.parser || ((d: string) => d as unknown as TData);
          const parsed = parser(typeof e.data === 'string' ? e.data : String(e.data));
          setData(parsed);
          setHistory((prev) => {
            const next = [...prev, parsed];
            return next.length > maxHistoryLength ? next.slice(next.length - maxHistoryLength) : next;
          });
          optionsRef.current.onMessage?.(parsed, e);
        } catch (parseErr) {
          console.error('[useWebSocketStream] Parse error:', parseErr);
        }
      };

      ws.onerror = (e) => {
        setError(e);
        optionsRef.current.onError?.(e);
      };

      ws.onclose = (e) => {
        if (heartbeatTimerRef.current) {
          clearTimeout(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        optionsRef.current.onClose?.(e);
        wsRef.current = null;
        if (!isManuallyClosedRef.current) {
          updateStatus('error');
          handleRetry();
        } else {
          updateStatus('closed');
        }
      };
    } catch (err) {
      console.error('[useWebSocketStream] Connection initialization error:', err);
      updateStatus('error');
      handleRetry();
    }
  }, [url, protocols, maxHistoryLength, resetHeartbeat, flushOutbox, updateStatus, handleRetry]);

  connectRef.current = connect;

  const send = useCallback(
    (payload: TSend): boolean => {
      const serializer =
        optionsRef.current.serializer ||
        ((data: TSend) => (typeof data === 'string' ? data : JSON.stringify(data)));
      const serialized = serializer(payload);

      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(serialized);
        return true;
      }

      if (bufferWhileConnecting && statusRef.current === 'connecting') {
        if (outboxBufferRef.current.length < maxBufferedMessages) {
          outboxBufferRef.current.push(serialized);
          setBufferedCount(outboxBufferRef.current.length);
          return true;
        }
      }

      return false;
    },
    [bufferWhileConnecting, maxBufferedMessages]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    data,
    history,
    error,
    bufferedCount,
    send,
    connect,
    disconnect,
    clearHistory,
  };
}
