import { useRef, useCallback, useEffect } from 'react';

export interface ThrottledFunction<TArgs extends unknown[], TReturn> {
  (...args: TArgs): TReturn | undefined;
  cancel: () => void;
  flush: () => TReturn | undefined;
  pending: () => boolean;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function useThrottledCallback<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  waitMs: number,
  options: ThrottleOptions = {}
): ThrottledFunction<TArgs, TReturn> {
  const { leading = true, trailing = true } = options;

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<TArgs | null>(null);
  const lastInvokeTimeRef = useRef<number>(0);
  const resultRef = useRef<TReturn | undefined>(undefined);

  const invoke = useCallback((time: number): TReturn | undefined => {
    lastInvokeTimeRef.current = time;
    if (lastArgsRef.current) {
      resultRef.current = fnRef.current(...lastArgsRef.current);
      lastArgsRef.current = null;
    }
    return resultRef.current;
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastArgsRef.current = null;
    lastInvokeTimeRef.current = 0;
  }, []);

  const flush = useCallback((): TReturn | undefined => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (lastArgsRef.current) {
      return invoke(Date.now());
    }
    return resultRef.current;
  }, [invoke]);

  const pending = useCallback((): boolean => {
    return timerRef.current !== null;
  }, []);

  const throttled = useCallback(
    (...args: TArgs): TReturn | undefined => {
      const now = Date.now();
      lastArgsRef.current = args;

      const isFirstCall = lastInvokeTimeRef.current === 0;
      const elapsed = now - lastInvokeTimeRef.current;
      const isPastWait = elapsed >= waitMs;

      // Leading execution on fresh call or after wait interval expired
      if (leading && (isFirstCall || isPastWait)) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const res = invoke(now);

        // If trailing is also enabled, arm a timer to guard window and capture intermediate calls
        if (trailing) {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            if (trailing && lastArgsRef.current) {
              invoke(Date.now());
            }
          }, waitMs);
        }

        return res;
      }

      // If trailing is enabled and timer is not currently scheduled
      if (trailing && !timerRef.current) {
        const remaining = isFirstCall ? waitMs : Math.max(0, waitMs - elapsed);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (trailing && lastArgsRef.current) {
            invoke(Date.now());
          }
        }, remaining);
      }

      return resultRef.current;
    },
    [leading, trailing, waitMs, invoke]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return Object.assign(throttled, {
    cancel,
    flush,
    pending,
  });
}
