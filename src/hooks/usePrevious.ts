import { useRef, useEffect } from 'react';

/**
 * Custom React hook to track the previous value of a state or prop.
 * Useful for comparing previous vs current values in effects or callbacks.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
