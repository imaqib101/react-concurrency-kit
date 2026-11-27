import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeout } from '../src/hooks/useTimeout';

describe('useTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules and executes callback after delay when autoStart is true', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, 1000));

    expect(result.current.isActive).toBe(true);
    expect(result.current.isPending).toBe(true);
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(callback).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('pauses and cancels pending timeout', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, 1000));

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('resets timeout countdown back to zero', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, 1000));

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.reset();
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    // 800ms after reset is not yet 1000ms
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('immediately triggers callback and clears timer', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, 1000));

    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.trigger();
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(false);

    // Ensure timer does not fire again
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not start automatically when autoStart is false', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, 1000, { autoStart: false }));

    expect(result.current.isActive).toBe(false);
    expect(result.current.isPending).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.start();
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not start if delay is null', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout(callback, null));

    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('cleans up pending timer on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useTimeout(callback, 1000));

    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
