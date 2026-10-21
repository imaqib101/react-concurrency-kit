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

export interface UseOptimisticMutationReturn<TData, TVariables> extends OptimisticMutationState<TData> {
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

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abort();
    setData(committedDataRef.current);
    setIsMutating(false);
    setIsOptimistic(false);
    setError(null);
  }, [abort]);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
        committedDataRef.current = result;
        setData(result);
        setIsOptimistic(false);
        setIsMutating(false);
        onSuccess?.(result, variables);
        onSettled?.(result, null, variables);
        return result;
      } catch (err: unknown) {
        const mutationError = err instanceof Error ? err : new Error(String(err));
        if (rollbackOnError) {
          setData(previousCommitted);
        }
        setIsOptimistic(false);
        setIsMutating(false);
        setError(mutationError);
        onError?.(mutationError, previousCommitted, variables);
        onSettled?.(undefined, mutationError, variables);
        throw mutationError;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [abort, mutationFn, optimisticUpdate, onSuccess, onError, onSettled, rollbackOnError]
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
