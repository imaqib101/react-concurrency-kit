import { useEffect, useRef, useCallback, useState } from 'react';

export interface UseTimeoutOptions {
  /** Whether the timeout starts active upon mount (default: true if delay is not null) */
  autoStart?: boolean;
}

export interface UseTimeoutReturn {
  /** Start or restart the timeout timer */
  start: () => void;
  /** Pause / cancel the pending timeout */
  pause: () => void;
  /** Reset and restart the timeout timer from zero */
  reset: () => void;
  /** Immediately invoke the callback and cancel the timer */
  trigger: () => void;
  /** Whether the timeout is currently counting down */
  isActive: boolean;
  /** Whether the callback has not yet executed (alias for isActive when scheduled) */
  isPending: boolean;
}

/**
 * Production React hook for declarative, resilient timeout scheduling with
 * start/pause/reset/trigger controls and automatic cleanup on unmount.
 */
export function useTimeout(
  callback: () => void,
  delay: number | null,
  options: UseTimeoutOptions = {}
): UseTimeoutReturn {
  const { autoStart = true } = options;
  const savedCallback = useRef(callback);
  const [isActive, setIsActive] = useState<boolean>(autoStart && delay !== null);
  const [resetCount, setResetCount] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep callback reference updated without triggering re-runs
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    setIsActive(false);
    clearTimer();
  }, [clearTimer]);

  const start = useCallback(() => {
    if (delay !== null) {
      setIsActive(true);
      setResetCount(c => c + 1);
    }
  }, [delay]);

  const reset = useCallback(() => {
    if (delay !== null) {
      setIsActive(true);
      setResetCount(c => c + 1);
    }
  }, [delay]);

  const trigger = useCallback(() => {
    pause();
    savedCallback.current();
  }, [pause]);

  useEffect(() => {
    if (!autoStart || delay === null) {
      return;
    }
    setIsActive(true);
  }, [autoStart, delay]);

  useEffect(() => {
    if (!isActive || delay === null) {
      clearTimer();
      return;
    }

    timerRef.current = setTimeout(() => {
      setIsActive(false);
      timerRef.current = null;
      savedCallback.current();
    }, delay);

    return () => {
      clearTimer();
    };
  }, [isActive, delay, resetCount, clearTimer]);

  return {
    start,
    pause,
    reset,
    trigger,
    isActive,
    isPending: isActive,
  };
}
