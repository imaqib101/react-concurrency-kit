import { useState, useRef, useCallback, useEffect } from 'react';
import { useThrottledCallback, type ThrottleOptions } from './useThrottledCallback';

export interface UseThrottledStateOptions extends ThrottleOptions {}

export interface ThrottledStateControls<T> {
  /** The current unscheduled/immediate value */
  immediate: T;
  /** Immediately flushes the pending throttled update */
  flush: () => void;
  /** Cancels any pending throttled update and leaves immediate state unchanged */
  cancel: () => void;
  /** Returns whether a throttled update is currently pending */
  isPending: () => boolean;
  /** Resets both immediate and throttled values to a given or initial state */
  reset: (value?: T | (() => T)) => void;
}

/**
 * Hook that manages dual-state: an immediate value for continuous high-frequency events
 * (e.g., scroll positions, slider dragging, window resizing), alongside a throttled
 * value that updates at most once every `waitMs` milliseconds.
 *
 * @param initialValue - Initial state value or factory function
 * @param waitMs - Throttle interval in milliseconds (default: 300)
 * @param options - Throttle configuration options (leading, trailing)
 */
export function useThrottledState<T>(
  initialValue: T | (() => T),
  waitMs: number = 300,
  options: UseThrottledStateOptions = {}
): [T, (updater: T | ((prev: T) => T)) => void, ThrottledStateControls<T>] {
  const [immediateValue, setImmediateValue] = useState<T>(initialValue);
  const [throttledValue, setThrottledValue] = useState<T>(initialValue);

  const initialValueRef = useRef(initialValue);
  const immediateRef = useRef(immediateValue);
  immediateRef.current = immediateValue;

  const throttledSet = useThrottledCallback(
    (val: T) => {
      setThrottledValue(val);
    },
    waitMs,
    options
  );

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: T) => T)(immediateRef.current)
          : updater;
      immediateRef.current = next;
      setImmediateValue(next);
      throttledSet(next);
    },
    [throttledSet]
  );

  const flush = useCallback(() => {
    throttledSet.flush();
  }, [throttledSet]);

  const cancel = useCallback(() => {
    throttledSet.cancel();
  }, [throttledSet]);

  const isPending = useCallback((): boolean => {
    return throttledSet.pending();
  }, [throttledSet]);

  const reset = useCallback(
    (value?: T | (() => T)) => {
      throttledSet.cancel();
      const target =
        value !== undefined
          ? typeof value === 'function'
            ? (value as () => T)()
            : value
          : typeof initialValueRef.current === 'function'
          ? (initialValueRef.current as () => T)()
          : initialValueRef.current;

      immediateRef.current = target;
      setImmediateValue(target);
      setThrottledValue(target);
    },
    [throttledSet]
  );

  useEffect(() => {
    return () => {
      throttledSet.cancel();
    };
  }, [throttledSet]);

  const controls: ThrottledStateControls<T> = {
    immediate: immediateValue,
    flush,
    cancel,
    isPending,
    reset,
  };

  return [throttledValue, setValue, controls];
}
