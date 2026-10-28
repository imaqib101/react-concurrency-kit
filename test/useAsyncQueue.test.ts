import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncQueue } from '../src/hooks/useAsyncQueue';

describe('useAsyncQueue', () => {
  it('processes items concurrently respecting the concurrency limit', async () => {
    let activeTasks = 0;
    let maxSimultaneous = 0;

    const taskFn = vi.fn(async (input: number) => {
      activeTasks += 1;
      maxSimultaneous = Math.max(maxSimultaneous, activeTasks);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeTasks -= 1;
      return input * 2;
    });

    const onAllComplete = vi.fn();

    const { result } = renderHook(() =>
      useAsyncQueue<number, number>({
        taskFn,
        concurrency: 2,
        autoStart: true,
        onAllComplete,
      })
    );

    act(() => {
      result.current.add([1, 2, 3, 4]);
    });

    await vi.waitFor(
      () => {
        expect(result.current.completedCount).toBe(4);
      },
      { timeout: 1500 }
    );

    expect(maxSimultaneous).toBeLessThanOrEqual(2);
    expect(result.current.progress).toBe(100);
    expect(onAllComplete).toHaveBeenCalledOnce();
    expect(result.current.items.map((i) => i.result)).toEqual([2, 4, 6, 8]);
  });

  it('handles item failure without blocking subsequent queue tasks', async () => {
    const taskFn = vi.fn(async (input: string) => {
      if (input === 'bad') {
        throw new Error('Task crashed');
      }
      return `ok-${input}`;
    });

    const onItemError = vi.fn();

    const { result } = renderHook(() =>
      useAsyncQueue<string, string>({
        taskFn,
        concurrency: 1,
        onItemError,
      })
    );

    act(() => {
      result.current.add(['good-1', 'bad', 'good-2']);
    });

    await vi.waitFor(
      () => {
        expect(result.current.completedCount).toBe(2);
        expect(result.current.failedCount).toBe(1);
      },
      { timeout: 1500 }
    );

    expect(onItemError).toHaveBeenCalledOnce();
    expect(result.current.items[1].status).toBe('failed');
    expect(result.current.items[1].error?.message).toBe('Task crashed');
    expect(result.current.items[2].status).toBe('completed');
  });

  it('supports pause and resume of execution', async () => {
    let resolveTask1: () => void = () => {};
    let resolveTask2: () => void = () => {};

    const task1Promise = new Promise<void>((res) => {
      resolveTask1 = res;
    });
    const task2Promise = new Promise<void>((res) => {
      resolveTask2 = res;
    });

    const taskFn = vi.fn(async (id: number) => {
      if (id === 1) await task1Promise;
      if (id === 2) await task2Promise;
      return id;
    });

    const { result } = renderHook(() =>
      useAsyncQueue<number, number>({
        taskFn,
        concurrency: 1,
        autoStart: false,
      })
    );

    act(() => {
      result.current.add([1, 2]);
    });

    expect(result.current.items.every((it) => it.status === 'pending')).toBe(true);

    // Start task 1
    act(() => {
      result.current.start();
    });

    await vi.waitFor(() => {
      expect(result.current.activeCount).toBe(1);
    });

    // Pause before completing task 1
    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    // Resolve task 1
    act(() => {
      resolveTask1();
    });

    await vi.waitFor(() => {
      expect(result.current.completedCount).toBe(1);
    });

    // Because queue is paused, task 2 remains pending
    expect(result.current.items[1].status).toBe('pending');
    expect(result.current.activeCount).toBe(0);

    // Resume queue execution
    act(() => {
      result.current.resume();
    });

    await vi.waitFor(() => {
      expect(result.current.activeCount).toBe(1);
    });

    // Resolve task 2
    act(() => {
      resolveTask2();
    });

    await vi.waitFor(() => {
      expect(result.current.completedCount).toBe(2);
    });
    expect(result.current.progress).toBe(100);
  });

  it('aborts individual items and whole queue gracefully', async () => {
    const taskFn = vi.fn(async (_: string, signal: AbortSignal) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'done';
    });

    const { result } = renderHook(() =>
      useAsyncQueue<string, string>({
        taskFn,
        concurrency: 2,
      })
    );

    act(() => {
      result.current.add(['a', 'b', 'c', 'd']);
    });

    // Abort all
    act(() => {
      result.current.abortAll();
    });

    await vi.waitFor(
      () => {
        expect(result.current.items.every((it) => it.status === 'aborted')).toBe(true);
      },
      { timeout: 500 }
    );

    expect(result.current.isRunning).toBe(false);
  });
});

describe('useAsyncQueue scheduling', () => {
  it('never starts the same task twice when processing is triggered repeatedly', () => {
    vi.useFakeTimers();
    try {
      const taskFn = vi.fn(() => new Promise<number>(() => {}));
      const { result } = renderHook(() =>
        useAsyncQueue<number, number>({ taskFn, concurrency: 3, autoStart: true })
      );

      act(() => {
        result.current.add([1]);
        result.current.resume();
        result.current.start();
        // All scheduled processQueue calls fire before React re-renders.
        vi.advanceTimersByTime(0);
      });

      expect(taskFn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useAsyncQueue retry', () => {
  it('re-runs failed items after retryFailed()', async () => {
    let attempts = 0;
    const taskFn = vi.fn(async (input: number) => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return input;
    });
    const { result } = renderHook(() => useAsyncQueue<number, number>({ taskFn }));

    act(() => {
      result.current.add(1);
    });
    await vi.waitFor(() => expect(result.current.failedCount).toBe(1));

    act(() => {
      result.current.retryFailed();
    });
    await vi.waitFor(() => expect(result.current.completedCount).toBe(1));
    expect(taskFn).toHaveBeenCalledTimes(2);
    expect(result.current.failedCount).toBe(0);
  });
});
