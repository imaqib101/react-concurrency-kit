import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedState } from '../src';

describe('useDebouncedState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with static value or factory function', () => {
    const { result: staticResult } = renderHook(() => useDebouncedState('initial'));
    expect(staticResult.current[0]).toBe('initial');
    expect(staticResult.current[2].immediate).toBe('initial');
    expect(staticResult.current[2].isPending()).toBe(false);

    const { result: fnResult } = renderHook(() => useDebouncedState(() => 42));
    expect(fnResult.current[0]).toBe(42);
    expect(fnResult.current[2].immediate).toBe(42);
  });

  it('updates immediate state instantly and debounced state after delay', () => {
    const { result } = renderHook(() => useDebouncedState('alpha', 200));

    act(() => {
      result.current[1]('beta');
    });

    // Immediate value should reflect immediately
    expect(result.current[2].immediate).toBe('beta');
    // Debounced value should still be old value
    expect(result.current[0]).toBe('alpha');
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current[0]).toBe('alpha');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBe('beta');
    expect(result.current[2].isPending()).toBe(false);
  });

  it('resets timer on rapid consecutive calls', () => {
    const { result } = renderHook(() => useDebouncedState(0, 150));

    act(() => {
      result.current[1](1);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current[1](2);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // At 200ms total, but only 100ms since last call -> still 0
    expect(result.current[0]).toBe(0);
    expect(result.current[2].immediate).toBe(2);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current[0]).toBe(2);
  });

  it('supports functional state updater', () => {
    const { result } = renderHook(() => useDebouncedState(10, 200));

    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[2].immediate).toBe(15);
    expect(result.current[0]).toBe(10);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe(15);
  });

  it('allows immediate flushing of pending state', () => {
    const { result } = renderHook(() => useDebouncedState('start', 300));

    act(() => {
      result.current[1]('flushed-value');
    });
    expect(result.current[0]).toBe('start');
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      result.current[2].flush();
    });

    expect(result.current[0]).toBe('flushed-value');
    expect(result.current[2].isPending()).toBe(false);
  });

  it('allows cancellation of pending updates', () => {
    const { result } = renderHook(() => useDebouncedState('start', 300));

    act(() => {
      result.current[1]('never-lands');
    });
    expect(result.current[2].isPending()).toBe(true);

    act(() => {
      result.current[2].cancel();
    });
    expect(result.current[2].isPending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current[0]).toBe('start');
  });

  it('resets both values on reset()', () => {
    const { result } = renderHook(() => useDebouncedState('orig', 300));

    act(() => {
      result.current[1]('changed');
    });

    act(() => {
      result.current[2].reset('override');
    });

    expect(result.current[0]).toBe('override');
    expect(result.current[2].immediate).toBe('override');
    expect(result.current[2].isPending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current[0]).toBe('override');
  });

  it('supports leading execution option', () => {
    const { result } = renderHook(() =>
      useDebouncedState('first', 300, { leading: true, trailing: false })
    );

    act(() => {
      result.current[1]('immediate-lead');
    });

    // With leading: true, debounced state updates on the first call
    expect(result.current[0]).toBe('immediate-lead');
    expect(result.current[2].immediate).toBe('immediate-lead');
  });
});
