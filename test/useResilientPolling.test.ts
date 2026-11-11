import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResilientPolling } from '../src/hooks/useResilientPolling';

describe('useResilientPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with default options and executes initial poll immediately', async () => {
    const fn = vi.fn().mockResolvedValue({ status: 'healthy', cpu: 12 });
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 3000,
        initialData: { status: 'idle', cpu: 0 },
        onSuccess,
      })
    );

    expect(result.current.data).toEqual({ status: 'idle', cpu: 0 });
    expect(result.current.isPolling).toBe(true);

    // Let the immediate promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ status: 'healthy', cpu: 12 });
    expect(result.current.pollCount).toBe(1);
    expect(result.current.failureCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith({ status: 'healthy', cpu: 12 });
  });

  it('respects immediate: false and waits for intervalMs before first poll', async () => {
    const fn = vi.fn().mockResolvedValue('data');

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 4000,
        immediate: false,
      })
    );

    expect(fn).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();

    // Advance timer to interval
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('data');
  });

  it('periodically polls according to intervalMs', async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      return `tick-${count}`;
    });

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 2000,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toBe('tick-1');
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(result.current.data).toBe('tick-2');
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance another 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(result.current.data).toBe('tick-3');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.current.pollCount).toBe(3);
  });

  it('handles errors and retries with backoff', async () => {
    const networkError = new Error('Gateway Timeout');
    const fn = vi.fn().mockRejectedValue(networkError);
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 5000,
        retryDelayMs: 1000,
        backoffMultiplier: 2,
        onError,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBe(networkError);
    expect(result.current.failureCount).toBe(1);
    expect(onError).toHaveBeenCalledWith(networkError, 1);

    // Retry should fire after retryDelay (1000ms + jitter < 1200ms)
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.failureCount).toBe(2);
    expect(onError).toHaveBeenCalledWith(networkError, 2);
  });

  it('stops polling and triggers onMaxRetriesExceeded when threshold reached', async () => {
    const failError = new Error('Service Unavailable');
    const fn = vi.fn().mockRejectedValue(failError);
    const onMaxRetriesExceeded = vi.fn();

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 3000,
        retryDelayMs: 500,
        maxRetries: 2,
        onMaxRetriesExceeded,
      })
    );

    // Attempt 1 fails
    await act(async () => {
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.failureCount).toBe(1);

    // Advance for retry 2
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.failureCount).toBe(2);
    expect(result.current.status).toBe('error');
    expect(result.current.isPolling).toBe(false);
    expect(onMaxRetriesExceeded).toHaveBeenCalledWith(failError);

    // Advancing more should NOT trigger further calls
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allows manual stop, pause, resume, refetch, and reset', async () => {
    let seq = 0;
    const fn = vi.fn().mockImplementation(async () => ++seq);

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 2000,
        initialData: 0,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toBe(1);

    // Test pause
    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.status).toBe('paused');

    // Advance while paused -> no calls
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    // Test resume
    await act(async () => {
      result.current.resume();
      await Promise.resolve();
    });
    expect(result.current.isPaused).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe(2);

    // Test refetch
    await act(async () => {
      await result.current.refetch();
    });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.current.data).toBe(3);

    // Test stop
    act(() => {
      result.current.stop();
    });
    expect(result.current.isPolling).toBe(false);
    expect(result.current.status).toBe('idle');

    // Test reset
    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBe(0);
    expect(result.current.pollCount).toBe(0);
    expect(result.current.failureCount).toBe(0);
    expect(result.current.status).toBe('idle');
  });

  it('pauses when document is hidden and resumes when visible', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => ++callCount);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: vi.fn(() => false),
    });

    const { result } = renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 2000,
        autoPauseOnHidden: true,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate tab becoming hidden
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isPaused).toBe(true);

    // Advancing timers should not poll
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate tab becoming visible again
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(result.current.isPaused).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts request when timeoutMs is exceeded', async () => {
    const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('done'), 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error('AbortError'));
        });
      });
    });

    const onError = vi.fn();

    renderHook(() =>
      useResilientPolling(fn, {
        intervalMs: 5000,
        timeoutMs: 200,
        onError,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('timed out after 200ms') }),
      1
    );
  });
});
