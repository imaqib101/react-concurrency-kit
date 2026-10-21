import { useRef, useCallback, useEffect } from 'react';

export interface DebouncedFunction<TArgs extends unknown[], TReturn> {
  (...args: TArgs): TReturn | undefined;
  cancel: () => void;
  flush: () => TReturn | undefined;
  pending: () => boolean;
}

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWaitMs?: number;
}

export function useDebouncedCallback<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  delayMs: number,
  options: DebounceOptions = {}
): DebouncedFunction<TArgs, TReturn> {
  const { leading = false, trailing = true, maxWaitMs } = options;

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<TArgs | null>(null);
  const resultRef = useRef<TReturn | undefined>(undefined);
  const isInvokedLeadingRef = useRef<boolean>(false);

  const invoke = useCallback(() => {
    if (lastArgsRef.current) {
      resultRef.current = fnRef.current(...lastArgsRef.current);
      lastArgsRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    isInvokedLeadingRef.current = false;
    return resultRef.current;
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    lastArgsRef.current = null;
    isInvokedLeadingRef.current = false;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current || maxTimerRef.current) {
      return invoke();
    }
    return resultRef.current;
  }, [invoke]);

  const pending = useCallback(() => {
    return timerRef.current !== null;
  }, []);

  const debounced = useCallback(
    (...args: TArgs): TReturn | undefined => {
      lastArgsRef.current = args;

      const shouldCallLeading = leading && !timerRef.current && !isInvokedLeadingRef.current;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (shouldCallLeading) {
        isInvokedLeadingRef.current = true;
        resultRef.current = fnRef.current(...args);
      }

      timerRef.current = setTimeout(() => {
        if (trailing && (!shouldCallLeading || lastArgsRef.current !== null)) {
          invoke();
        } else {
          cancel();
        }
      }, delayMs);

      if (maxWaitMs !== undefined && !maxTimerRef.current) {
        maxTimerRef.current = setTimeout(() => {
          invoke();
        }, maxWaitMs);
      }

      return resultRef.current;
    },
    [delayMs, leading, trailing, maxWaitMs, invoke, cancel]
  );

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  const debouncedFn = debounced as DebouncedFunction<TArgs, TReturn>;
  debouncedFn.cancel = cancel;
  debouncedFn.flush = flush;
  debouncedFn.pending = pending;

  return debouncedFn;
}
