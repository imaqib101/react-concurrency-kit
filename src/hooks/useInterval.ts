import { useEffect, useRef, useCallback, useState } from 'react';

export interface UseIntervalOptions {
  /** Whether the interval starts active (default: true if delay is not null) */
  autoStart?: boolean;
}

export interface UseIntervalReturn {
  /** Start or resume the interval */
  start: () => void;
  /** Pause the interval */
  pause: () => void;
  /** Reset interval timer */
  reset: () => void;
  /** Whether the interval is currently active */
  isActive: boolean;
}

/**
 * Production React hook for declarative, robust interval execution with pause/resume/reset controls
 * and automatic cleanup on unmount.
 */
export function useInterval(
  callback: () => void,
  delay: number | null,
  options: UseIntervalOptions = {}
): UseIntervalReturn {
  const { autoStart = true } = options;
  const savedCallback = useRef(callback);
  const [isActive, setIsActive] = useState<boolean>(autoStart && delay !== null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep callback fresh
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const pause = useCallback(() => {
    setIsActive(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (delay !== null) {
      setIsActive(true);
    }
  }, [delay]);

  const reset = useCallback(() => {
    pause();
    start();
  }, [pause, start]);

  useEffect(() => {
    if (!autoStart || delay === null) {
      return;
    }
    setIsActive(true);
  }, [autoStart, delay]);

  useEffect(() => {
    if (!isActive || delay === null) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      savedCallback.current();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, delay]);

  return {
    start,
    pause,
    reset,
    isActive,
  };
}
