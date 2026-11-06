import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAsyncStateOptions<TData> {
  /**
   * Initial data before the async function executes.
   */
  initialData?: TData;
  /**
   * If true, immediately triggers the async action on mount or when dependencies change.
   * Default: false.
   */
  immediate?: boolean;
  /**
   * Timeout in milliseconds after which the execution is automatically aborted.
   */
  timeoutMs?: number;
  /**
   * Callback fired upon successful resolution.
   */
  onSuccess?: (data: TData) => void;
  /**
   * Callback fired upon rejection or abort.
   */
  onError?: (error: Error) => void;
  /**
   * Callback fired when execution finishes (success or failure).
   */
  onSettled?: (data: TData | undefined, error: Error | null) => void;
}

export type AsyncStateStatus = 'idle' | 'pending' | 'success' | 'error';

export interface AsyncStateSnapshot<TData> {
  status: AsyncStateStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: TData | undefined;
  error: Error | null;
}

export interface UseAsyncStateReturn<TData, TArgs extends unknown[]> extends AsyncStateSnapshot<TData> {
  /**
   * Executes the asynchronous function. If a previous run is pending, it is aborted to avoid race conditions.
   */
  execute: (...args: TArgs) => Promise<TData>;
  /**
   * Aborts the currently running asynchronous execution if active.
   */
  abort: () => void;
  /**
   * Resets the state back to idle and initial data.
   */
  reset: () => void;
  /**
   * Mutates the internal data value directly without triggering an async execution.
   */
  setData: (updater: TData | ((prev: TData | undefined) => TData)) => void;
}

/**
 * Hook for managing async promise workflows with AbortSignal cancellation, race condition guard,
 * optional execution timeout, and full state tracking (idle, pending, success, error).
 */
export function useAsyncState<TData, TArgs extends unknown[] = []>(
  asyncFn: (signal: AbortSignal, ...args: TArgs) => Promise<TData>,
  options: UseAsyncStateOptions<TData> = {}
): UseAsyncStateReturn<TData, TArgs> {
  const {
    initialData,
    immediate = false,
    timeoutMs,
  } = options;

  const [status, setStatus] = useState<AsyncStateStatus>('idle');
  const [data, setDataState] = useState<TData | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);

  const asyncFnRef = useRef(asyncFn);
  asyncFnRef.current = asyncFn;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeExecutionIdRef = useRef<number>(0);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abort();
    activeExecutionIdRef.current += 1;
    setStatus('idle');
    setDataState(optionsRef.current.initialData);
    setError(null);
  }, [abort]);

  const setData = useCallback((updater: TData | ((prev: TData | undefined) => TData)) => {
    setDataState((prev) => {
      if (typeof updater === 'function') {
        return (updater as (prev: TData | undefined) => TData)(prev);
      }
      return updater;
    });
  }, []);

  const execute = useCallback(
    async (...args: TArgs): Promise<TData> => {
      // Abort any in-flight execution to prevent race condition
      abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const executionId = ++activeExecutionIdRef.current;

      setStatus('pending');
      setError(null);

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      if (timeoutMs && timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          controller.abort(new Error(`Async execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      try {
        const result = await asyncFnRef.current(controller.signal, ...args);

        // Ensure this is still the active execution
        if (executionId === activeExecutionIdRef.current) {
          setDataState(result);
          setStatus('success');
          setError(null);
          optionsRef.current.onSuccess?.(result);
          optionsRef.current.onSettled?.(result, null);
        }
        return result;
      } catch (err: unknown) {
        const normalizedError =
          err instanceof Error
            ? err
            : new Error(typeof err === 'string' ? err : 'Unknown async error');

        if (executionId === activeExecutionIdRef.current) {
          setError(normalizedError);
          setStatus('error');
          optionsRef.current.onError?.(normalizedError);
          optionsRef.current.onSettled?.(undefined, normalizedError);
        }
        throw normalizedError;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [abort, timeoutMs]
  );

  useEffect(() => {
    if (immediate) {
      (execute as unknown as () => void)();
    }

    return () => {
      abort();
    };
  }, [immediate, execute, abort]);

  return {
    status,
    isLoading: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    data,
    error,
    execute,
    abort,
    reset,
    setData,
  };
}
