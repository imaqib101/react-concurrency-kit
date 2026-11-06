import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncState } from '../src/hooks/useAsyncState';

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with idle state and provided initialData', () => {
    const fn = vi.fn().mockResolvedValue('success');
    const { result } = renderHook(() =>
      useAsyncState(fn, { initialData: 'initial' })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBe('initial');
    expect(result.current.error).toBeNull();
  });

  it('handles successful execution', async () => {
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    const fn = vi.fn().mockImplementation(async (_signal, id: number) => {
      return `result-${id}`;
    });

    const { result } = renderHook(() =>
      useAsyncState(fn, { onSuccess, onSettled })
    );

    let promise: Promise<string>;
    act(() => {
      promise = result.current.execute(42);
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await promise;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toBe('result-42');
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith('result-42');
    expect(onSettled).toHaveBeenCalledWith('result-42', null);
  });

  it('handles error execution and error callbacks', async () => {
    const onError = vi.fn();
    const onSettled = vi.fn();
    const testError = new Error('Async network failure');

    const fn = vi.fn().mockRejectedValue(testError);

    const { result } = renderHook(() =>
      useAsyncState(fn, { onError, onSettled })
    );

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.execute();
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toBe(testError);
    expect(result.current.status).toBe('error');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(testError);
    expect(onError).toHaveBeenCalledWith(testError);
    expect(onSettled).toHaveBeenCalledWith(undefined, testError);
  });

  it('aborts previous in-flight execution when re-executed to prevent race conditions', async () => {
    const signals: AbortSignal[] = [];

    const fn = vi.fn().mockImplementation(
      (signal: AbortSignal, delay: number, val: string): Promise<string> => {
        signals.push(signal);
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve(val), delay);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        });
      }
    );

    const { result } = renderHook(() => useAsyncState<string, [number, string]>(fn));

    let p1: Promise<string>;
    let p2: Promise<string>;

    act(() => {
      p1 = result.current.execute(200, 'first');
    });

    expect(signals[0].aborted).toBe(false);

    act(() => {
      p2 = result.current.execute(50, 'second');
    });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    // Suppress p1 rejection
    p1!.catch(() => {});

    await act(async () => {
      vi.advanceTimersByTime(50);
      await p2;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.data).toBe('second');
  });

  it('aborts on explicit abort() call', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fn = vi.fn().mockImplementation((signal: AbortSignal): Promise<string> => {
      capturedSignal = signal;
      return new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('Manually aborted'));
        });
      });
    });

    const { result } = renderHook(() => useAsyncState<string>(fn));

    let promise: Promise<string>;
    act(() => {
      promise = result.current.execute();
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    act(() => {
      result.current.abort();
    });

    expect(capturedSignal!.aborted).toBe(true);

    await act(async () => {
      try {
        await promise;
      } catch {
        // expected
      }
    });

    // Aborted execution was discarded because activeExecutionId check still handles it
    expect(result.current.status).toBe('error');
  });

  it('supports timeoutMs auto-abort', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fn = vi.fn().mockImplementation((signal: AbortSignal): Promise<string> => {
      capturedSignal = signal;
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve('done'), 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Timed out'));
        });
      });
    });

    const { result } = renderHook(() =>
      useAsyncState<string>(fn, { timeoutMs: 300 })
    );

    let promise: Promise<string>;
    act(() => {
      promise = result.current.execute();
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      try {
        await promise;
      } catch {
        // expected
      }
    });

    expect(capturedSignal!.aborted).toBe(true);
    expect(result.current.status).toBe('error');
  });

  it('resets state properly via reset()', async () => {
    const fn = vi.fn().mockResolvedValue('completed');
    const { result } = renderHook(() =>
      useAsyncState(fn, { initialData: 'initial' })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('completed');
    expect(result.current.status).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBe('initial');
    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('updates data via setData updater', () => {
    const fn = vi.fn().mockResolvedValue(10);
    const { result } = renderHook(() =>
      useAsyncState(fn, { initialData: 0 })
    );

    act(() => {
      result.current.setData(5);
    });
    expect(result.current.data).toBe(5);

    act(() => {
      result.current.setData((prev) => (prev ?? 0) + 10);
    });
    expect(result.current.data).toBe(15);
  });

  it('runs automatically when immediate is true', async () => {
    const fn = vi.fn().mockResolvedValue('immediate-value');

    const { result } = renderHook(() =>
      useAsyncState(fn, { immediate: true })
    );

    await act(async () => {
      // flush promises
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('success');
    expect(result.current.data).toBe('immediate-value');
  });
});
