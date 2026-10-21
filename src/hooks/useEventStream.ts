import { useState, useEffect, useRef, useCallback } from 'react';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseEventStreamOptions<T = unknown> {
  url: string;
  autoConnect?: boolean;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  heartbeatTimeoutMs?: number;
  maxHistoryLength?: number;
  parser?: (data: string) => T;
  onOpen?: (event: Event) => void;
  onMessage?: (data: T, rawEvent: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: () => void;
}

export interface UseEventStreamReturn<T> {
  status: StreamStatus;
  data: T | null;
  history: T[];
  error: Event | null;
  connect: () => void;
  disconnect: () => void;
  clearHistory: () => void;
}

export function useEventStream<T = string>(
  options: UseEventStreamOptions<T>
): UseEventStreamReturn<T> {
  const {
    url,
    autoConnect = true,
    maxRetries = 5,
    initialRetryDelayMs = 1000,
    maxRetryDelayMs = 30000,
    heartbeatTimeoutMs = 45000,
    maxHistoryLength = 100,
  } = options;

  // Keep latest callbacks in ref to avoid re-triggering effect on inline props
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [data, setData] = useState<T | null>(null);
  const [history, setHistory] = useState<T[]>([]);
  const [error, setError] = useState<Event | null>(null);

  const statusRef = useRef<StreamStatus>(status);
  statusRef.current = status;

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyClosedRef = useRef<boolean>(false);

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
        if (eventSourceRef.current && statusRef.current === 'open') {
          eventSourceRef.current.close();
          updateStatus('error');
          handleRetry();
        }
      }, heartbeatTimeoutMs);
    }
  }, [heartbeatTimeoutMs, updateStatus, handleRetry]);

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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    updateStatus('closed');
    optionsRef.current.onClose?.();
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isManuallyClosedRef.current = false;
    updateStatus('connecting');
    setError(null);

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = (e) => {
        retryCountRef.current = 0;
        updateStatus('open');
        resetHeartbeat();
        optionsRef.current.onOpen?.(e);
      };

      es.onmessage = (e) => {
        resetHeartbeat();
        try {
          const parser = optionsRef.current.parser || ((d: string) => d as unknown as T);
          const parsed = parser(e.data);
          setData(parsed);
          setHistory((prev) => {
            const next = [...prev, parsed];
            return next.length > maxHistoryLength ? next.slice(next.length - maxHistoryLength) : next;
          });
          optionsRef.current.onMessage?.(parsed, e);
        } catch (parseErr) {
          console.error('[useEventStream] Parse error:', parseErr);
        }
      };

      es.onerror = (e) => {
        setError(e);
        optionsRef.current.onError?.(e);
        es.close();
        eventSourceRef.current = null;
        if (!isManuallyClosedRef.current) {
          updateStatus('error');
          handleRetry();
        }
      };
    } catch {
      updateStatus('error');
      handleRetry();
    }
  }, [url, maxHistoryLength, resetHeartbeat, updateStatus, handleRetry]);

  connectRef.current = connect;

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
    connect,
    disconnect,
    clearHistory,
  };
}
