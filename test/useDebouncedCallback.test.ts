import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from '../src/hooks/useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces function execution by specified delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current('first');
      result.current('second');
      result.current('third');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });

  it('supports leading execution', () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(callback, 300, { leading: true, trailing: false })
    );

    act(() => {
      result.current('immediate');
      result.current('ignored');
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('immediate');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending invocation when cancel is called', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 150));

    act(() => {
      result.current('payload');
      result.current.cancel();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(callback).not.toHaveBeenCalled();
    expect(result.current.pending()).toBe(false);
  });
});

describe('useDebouncedCallback extras', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flush() invokes the pending call immediately', () => {
    const fn = vi.fn((x: number) => x * 2);
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current(4);
    });
    expect(result.current.pending()).toBe(true);
    let value: number | undefined;
    act(() => {
      value = result.current.flush();
    });
    expect(value).toBe(8);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending()).toBe(false);
  });

  it('cancel() drops the pending call', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current();
      result.current.cancel();
      vi.advanceTimersByTime(500);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes on the leading edge only when trailing is disabled', () => {
    const fn = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(fn, 100, { leading: true, trailing: false })
    );
    act(() => {
      result.current('a');
      result.current('b');
      vi.advanceTimersByTime(200);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('maxWaitMs forces an invocation during continuous calls', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100, { maxWaitMs: 250 }));
    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current(i);
        vi.advanceTimersByTime(60);
      }
    });
    expect(fn).toHaveBeenCalled();
  });

  it('does not invoke after unmount', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current();
    });
    unmount();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
