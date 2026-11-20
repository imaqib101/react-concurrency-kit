import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInterval } from '../src/hooks/useInterval';

describe('useInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls callback at specified interval', () => {
    const callback = vi.fn();
    renderHook(() => useInterval(callback, 1000));

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('supports pause and resume controls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useInterval(callback, 500));

    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Should not have been called while paused
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.start();
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not run when delay is null', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useInterval(callback, null));

    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('supports autoStart=false option', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useInterval(callback, 100, { autoStart: false }));

    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.start();
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
