import { useState, useCallback, useRef } from 'react';

export interface OptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables, signal?: AbortSignal) => Promise<TData>;
  optimisticUpdate?: (current: TData, variables: TVariables) => TData;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, rollbackValue: TData, variables: TVariables) => void;
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables) => void;
  rollbackOnError?: boolean;
}

export interface OptimisticMutationState<TData> {
  data: TData;
  isMutating: boolean;
  isOptimistic: boolean;
  error: Error | null;
}

export interface UseOptimisticMutationReturn<
  TData,
  TVariables,
> extends OptimisticMutationState<TData> {
  mutate: (variables: TVariables) => Promise<TData>;
  reset: () => void;
  abort: () => void;
}

export function useOptimisticMutation<TData, TVariables>(
  initialData: TData,
  options: OptimisticMutationOptions<TData, TVariables>
): UseOptimisticMutationReturn<TData, TVariables> {
  const {
    mutationFn,
    optimisticUpdate,
    onSuccess,
    onError,
    onSettled,
    rollbackOnError = true,
  } = options;

  const [data, setData] = useState<TData>(initialData);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [isOptimistic, setIsOptimistic] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const committedDataRef = useRef<TData>(initialData);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancels the in-flight request (if any) and marks it stale so that its
  // eventual settlement can no longer touch state.
  const cancelInFlight = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (!abortControllerRef.current) return;
    cancelInFlight();
    setData(committedDataRef.current);
    setIsMutating(false);
    setIsOptimistic(false);
  }, [cancelInFlight]);

  const reset = useCallback(() => {
    cancelInFlight();
    setData(committedDataRef.current);
    setIsMutating(false);
    setIsOptimistic(false);
    setError(null);
  }, [cancelInFlight]);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      cancelInFlight();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const isCurrent = () => abortControllerRef.current === controller;

      const previousCommitted = committedDataRef.current;
      setError(null);
      setIsMutating(true);

      if (optimisticUpdate) {
        const optimisticVal = optimisticUpdate(previousCommitted, variables);
        setData(optimisticVal);
        setIsOptimistic(true);
      }

      try {
        const result = await mutationFn(variables, controller.signal);
        // A newer mutation, abort() or reset() superseded this one: do not
        // commit its result or fire callbacks.
        if (!isCurrent()) return result;
        committedDataRef.current = result;
        setData(result);
        setIsOptimistic(false);
        setIsMutating(false);
        onSuccess?.(result, variables);
        onSettled?.(result, null, variables);
        return result;
      } catch (err: unknown) {
        const mutationError = err instanceof Error ? err : new Error(String(err));
        if (!isCurrent()) throw mutationError;
        if (rollbackOnError) {
          setData(committedDataRef.current);
        }
        setIsOptimistic(false);
        setIsMutating(false);
        setError(mutationError);
        onError?.(mutationError, previousCommitted, variables);
        onSettled?.(undefined, mutationError, variables);
        throw mutationError;
      } finally {
        if (isCurrent()) {
          abortControllerRef.current = null;
        }
      }
    },
    [cancelInFlight, mutationFn, optimisticUpdate, onSuccess, onError, onSettled, rollbackOnError]
  );

  return {
    data,
    isMutating,
    isOptimistic,
    error,
    mutate,
    reset,
    abort,
  };
}
