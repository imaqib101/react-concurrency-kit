import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThrottledCallback } from '../src/hooks/useThrottledCallback';

describe('useThrottledCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throttles rapid calls and executes leading and trailing invocations', () => {
    const callback = vi.fn((val: string) => `result:${val}`);
    const { result } = renderHook(() => useThrottledCallback(callback, 200));

    act(() => {
      result.current('call-1');
    });

    // Leading call executed immediately
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('call-1');

    act(() => {
      result.current('call-2');
      result.current('call-3');
    });

    // Still only 1 execution during the throttle window
    expect(callback).toHaveBeenCalledTimes(1);

    // Fast-forward past throttle wait interval
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Trailing call executed with latest arguments
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('call-3');
  });

  it('supports leading: false and trailing: true', () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useThrottledCallback(callback, 200, { leading: false, trailing: true })
    );

    act(() => {
      result.current('event-1');
      result.current('event-2');
    });

    // No leading execution
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Trailing execution occurred
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('event-2');
  });

  it('supports leading: true and trailing: false', () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useThrottledCallback(callback, 200, { leading: true, trailing: false })
    );

    act(() => {
      result.current('event-1');
      result.current('event-2');
      result.current('event-3');
    });

    // Only leading executed
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('event-1');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // No trailing execution occurred
    expect(callback).toHaveBeenCalledTimes(1);

    // After throttle interval, new call executes immediately again
    act(() => {
      result.current('event-4');
    });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('event-4');
  });

  it('cancels pending trailing execution on cancel()', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 200));

    act(() => {
      result.current('initial');
      result.current('pending-trailing');
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.current.pending()).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Trailing call was cancelled
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('flushes pending invocation immediately on flush()', () => {
    const callback = vi.fn((x: number) => x * 2);
    const { result } = renderHook(() => useThrottledCallback(callback, 200));

    act(() => {
      result.current(10);
      result.current(20);
    });

    expect(callback).toHaveBeenCalledTimes(1);

    let flushedValue: number | undefined;
    act(() => {
      flushedValue = result.current.flush();
    });

    expect(flushedValue).toBe(40);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(20);
    expect(result.current.pending()).toBe(false);
  });
});
