import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseDebouncedAsyncOptions<T> {
  delay: number;
  initialValue?: T;
  onError?: (error: Error) => void;
}

export interface UseDebouncedAsyncReturn<T, Args extends any[]> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  execute: (...args: Args) => Promise<T>;
  cancel: () => void;
}

export function useDebouncedAsync<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  options: UseDebouncedAsyncOptions<T>
): UseDebouncedAsyncReturn<T, Args> {
  const [data, setData] = useState<T | undefined>(options.initialValue);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  const execute = useCallback(
    (...args: Args) => {
      cancel();
      setLoading(true);
      setError(null);

      return new Promise<T>((resolve, reject) => {
        timerRef.current = setTimeout(async () => {
          const controller = new AbortController();
          abortControllerRef.current = controller;

          try {
            const result = await asyncFn(...args);
            if (!controller.signal.aborted) {
              setData(result);
              setLoading(false);
              resolve(result);
            }
          } catch (err: any) {
            if (!controller.signal.aborted) {
              const errorObj = err instanceof Error ? err : new Error(String(err));
              setError(errorObj);
              setLoading(false);
              if (options.onError) {
                options.onError(errorObj);
              }
              reject(errorObj);
            }
          }
        }, options.delay);
      });
    },
    [asyncFn, options.delay, options.onError, cancel]
  );

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    data,
    loading,
    error,
    execute,
    cancel,
  };
}
