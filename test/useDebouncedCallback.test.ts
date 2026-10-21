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
