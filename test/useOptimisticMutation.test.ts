import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOptimisticMutation } from '../src/hooks/useOptimisticMutation';

describe('useOptimisticMutation', () => {
  it('initializes with default data and states', () => {
    const { result } = renderHook(() =>
      useOptimisticMutation(
        { count: 0 },
        {
          mutationFn: async (vars: { amount: number }) => ({ count: vars.amount }),
        }
      )
    );

    expect(result.current.data).toEqual({ count: 0 });
    expect(result.current.isMutating).toBe(false);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('applies optimistic update immediately, then resolves mutation', async () => {
    let resolveFn: (val: { count: number }) => void;
    const promise = new Promise<{ count: number }>((resolve) => {
      resolveFn = resolve;
    });

    const mutationFn = vi.fn().mockImplementation(() => promise);
    const optimisticUpdate = vi.fn((current, vars: { amount: number }) => ({
      count: current.count + vars.amount,
    }));

    const { result } = renderHook(() =>
      useOptimisticMutation(
        { count: 10 },
        {
          mutationFn,
          optimisticUpdate,
        }
      )
    );

    let mutatePromise: Promise<{ count: number }>;
    act(() => {
      mutatePromise = result.current.mutate({ amount: 5 });
    });

    // Right after mutation trigger: optimistic data is applied
    expect(result.current.isMutating).toBe(true);
    expect(result.current.isOptimistic).toBe(true);
    expect(result.current.data).toEqual({ count: 15 });

    // Settle promise
    await act(async () => {
      resolveFn!({ count: 15 });
      await mutatePromise;
    });

    expect(result.current.isMutating).toBe(false);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.data).toEqual({ count: 15 });
  });

  it('rolls back state on mutation failure', async () => {
    const error = new Error('Network timeout');
    const mutationFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useOptimisticMutation(
        { count: 50 },
        {
          mutationFn,
          optimisticUpdate: (current, vars: { amount: number }) => ({
            count: current.count + vars.amount,
          }),
          onError,
          rollbackOnError: true,
        }
      )
    );

    await act(async () => {
      try {
        await result.current.mutate({ amount: 20 });
      } catch {
        // Expected
      }
    });

    expect(result.current.isMutating).toBe(false);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.data).toEqual({ count: 50 }); // rolled back
    expect(result.current.error).toBe(error);
    expect(onError).toHaveBeenCalledWith(error, { count: 50 }, { amount: 20 });
  });
});
