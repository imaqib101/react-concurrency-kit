import { useState, useRef, useCallback } from 'react';
import { useDebouncedCallback, type DebounceOptions } from './useDebouncedCallback';

export interface UseDebouncedStateOptions extends DebounceOptions {}

export interface DebouncedStateControls<T> {
  /** The current unscheduled/immediate value */
  immediate: T;
  /** Immediately flushes the pending debounced update */
  flush: () => void;
  /** Cancels any pending debounced update and leaves immediate state unchanged */
  cancel: () => void;
  /** Returns whether a debounced update is currently pending */
  isPending: () => boolean;
  /** Resets both immediate and debounced values to a given or initial state */
  reset: (value?: T | (() => T)) => void;
}

/**
 * Hook that manages dual-state: an immediate value for zero-lag controlled UI inputs,
 * alongside a debounced value that settles after a specified delay for expensive operations.
 *
 * @param initialValue - Initial value or initializer function
 * @param delayMs - Debounce delay in milliseconds (default: 300)
 * @param options - Debounce configuration options (leading, trailing, maxWaitMs)
 */
export function useDebouncedState<T>(
  initialValue: T | (() => T),
  delayMs: number = 300,
  options: UseDebouncedStateOptions = {}
): [T, (updater: T | ((prev: T) => T)) => void, DebouncedStateControls<T>] {
  const [immediateValue, setImmediateValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const initialValueRef = useRef(initialValue);

  const debouncedSet = useDebouncedCallback(
    (val: T) => {
      setDebouncedValue(val);
    },
    delayMs,
    options
  );

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setImmediateValue((prevImmediate) => {
        const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prevImmediate) : updater;
        debouncedSet(next);
        return next;
      });
    },
    [debouncedSet]
  );

  const flush = useCallback(() => {
    debouncedSet.flush();
  }, [debouncedSet]);

  const cancel = useCallback(() => {
    debouncedSet.cancel();
  }, [debouncedSet]);

  const isPending = useCallback(() => {
    return debouncedSet.pending();
  }, [debouncedSet]);

  const reset = useCallback(
    (newValue?: T | (() => T)) => {
      debouncedSet.cancel();
      const resolved =
        newValue !== undefined
          ? typeof newValue === 'function'
            ? (newValue as () => T)()
            : newValue
          : typeof initialValueRef.current === 'function'
          ? (initialValueRef.current as () => T)()
          : initialValueRef.current;
      setImmediateValue(resolved);
      setDebouncedValue(resolved);
    },
    [debouncedSet]
  );

  const controls: DebouncedStateControls<T> = {
    immediate: immediateValue,
    flush,
    cancel,
    isPending,
    reset,
  };

  return [debouncedValue, setValue, controls];
}
