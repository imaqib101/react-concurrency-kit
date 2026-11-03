import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useThrottledState } from '../src';

describe('useThrottledState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with static value or factory function', () => {
    const { result: staticResult } = renderHook(() => useThrottledState('hello'));
    expect(staticResult.current[0]).toBe('hello');
    expect(staticResult.current[2].immediate).toBe('hello');
    expect(staticResult.current[2].isPending()).toBe(false);

    const { result: fnResult } = renderHook(() => useThrottledState(() => 99));
    expect(fnResult.current[0]).toBe(99);
    expect(fnResult.current[2].immediate).toBe(99);
  });

  it('updates leading state immediately and throttles intermediate updates', () => {
    const { result } = renderHook(() => useThrottledState(0, 200));

    // First call triggers leading edge synchronously
    act(() => {
      result.current[1](1);
    });
    expect(result.current[2].immediate).toBe(1);
    expect(result.current[0]).toBe(1);

    // Second call within 200ms window updates immediate, but throttles debounced/throttled state
    act(() => {
      result.current[1](2);
    });
    expect(result.current[2].immediate).toBe(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[2].isPending()).toBe(true);

    // Advance 100ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe(1);

    // Third call within window
    act(() => {
      result.current[1](3);
    });
    expect(result.current[2].immediate).toBe(3);
    expect(result.current[0]).toBe(1);

    // Advance remaining 100ms to complete 200ms throttle interval
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe(3);
    expect(result.current[2].isPending()).toBe(false);
  });

  it('supports updater function callback', () => {
    const { result } = renderHook(() => useThrottledState(10, 300));

    act(() => {
      result.current[1]((prev) => prev + 5);
    });
    expect(result.current[2].immediate).toBe(15);
    expect(result.current[0]).toBe(15);

    act(() => {
      result.current[1]((prev) => prev * 2);
    });
    expect(result.current[2].immediate).toBe(30);
    expect(result.current[0]).toBe(15);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current[0]).toBe(30);
  });

  it('respects leading: false configuration', () => {
    const { result } = renderHook(() =>
      useThrottledState('start', 200, { leading: false, trailing: true })
    );

    act(() => {
      result.current[1]('update-1');
    });
    expect(result.current[2].immediate).toBe('update-1');
    expect(result.current[0]).toBe('start');
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('update-1');
    expect(result.current[2].isPending()).toBe(false);
  });

  it('flushes pending throttled state on demand', () => {
    const { result } = renderHook(() => useThrottledState('init', 300));

    act(() => {
      result.current[1]('first');
    });
    expect(result.current[0]).toBe('first');

    act(() => {
      result.current[1]('second');
    });
    expect(result.current[0]).toBe('first');
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      result.current[2].flush();
    });
    expect(result.current[0]).toBe('second');
    expect(result.current[2].isPending()).toBe(false);
  });

  it('cancels pending throttled state', () => {
    const { result } = renderHook(() => useThrottledState('a', 200));

    act(() => {
      result.current[1]('b');
    });
    act(() => {
      result.current[1]('c');
    });
    expect(result.current[0]).toBe('b');
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      result.current[2].cancel();
    });
    expect(result.current[2].isPending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current[0]).toBe('b');
    expect(result.current[2].immediate).toBe('c');
  });

  it('resets both immediate and throttled states', () => {
    const { result } = renderHook(() => useThrottledState('init-val', 200));

    act(() => {
      result.current[1]('changed');
    });
    expect(result.current[0]).toBe('changed');

    // Reset back to initial value
    act(() => {
      result.current[2].reset();
    });
    expect(result.current[0]).toBe('init-val');
    expect(result.current[2].immediate).toBe('init-val');
    expect(result.current[2].isPending()).toBe(false);

    // Reset to an explicit custom value
    act(() => {
      result.current[2].reset('custom-reset');
    });
    expect(result.current[0]).toBe('custom-reset');
    expect(result.current[2].immediate).toBe('custom-reset');
  });

  it('cancels pending throttled timer on unmount', () => {
    const { result, unmount } = renderHook(() => useThrottledState(0, 200));

    act(() => {
      result.current[1](1);
      result.current[1](2);
    });
    expect(result.current[2].isPending()).toBe(true);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
