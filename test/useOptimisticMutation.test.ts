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

describe('useOptimisticMutation concurrency', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('ignores the result of a superseded mutation that settles late', async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const queue = [first, second];
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOptimisticMutation(0, {
        mutationFn: (_vars: string) => queue.shift()!.promise,
        onSuccess,
      })
    );

    let p1!: Promise<number>;
    let p2!: Promise<number>;
    act(() => {
      p1 = result.current.mutate('a');
    });
    act(() => {
      p2 = result.current.mutate('b');
    });

    await act(async () => {
      second.resolve(2);
      await p2;
    });
    expect(result.current.data).toBe(2);

    await act(async () => {
      first.resolve(1);
      await p1;
    });

    // The stale first mutation must not overwrite the newer committed value.
    expect(result.current.data).toBe(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(2, 'b');
  });

  it('abort() clears the pending state and restores committed data', async () => {
    const pending = deferred<number>();
    const { result } = renderHook(() =>
      useOptimisticMutation(5, {
        mutationFn: (_vars: number, signal?: AbortSignal) => {
          signal?.addEventListener('abort', () => pending.reject(new Error('aborted')));
          return pending.promise;
        },
        optimisticUpdate: (_current, vars: number) => vars,
      })
    );

    let p!: Promise<number>;
    act(() => {
      p = result.current.mutate(9);
      p.catch(() => {});
    });
    expect(result.current.data).toBe(9);

    await act(async () => {
      result.current.abort();
      await p.catch(() => {});
    });

    expect(result.current.data).toBe(5);
    expect(result.current.isMutating).toBe(false);
    expect(result.current.isOptimistic).toBe(false);
  });
});
