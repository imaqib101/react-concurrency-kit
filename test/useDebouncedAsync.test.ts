import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedAsync } from '../src';

describe('useDebouncedAsync', () => {
  it('should debounce async function calls', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('result');

    const { result } = renderHook(() =>
      useDebouncedAsync(fn, { delay: 500 })
    );

    act(() => {
      result.current.execute('arg1');
      result.current.execute('arg2');
    });

    expect(fn).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg2');
    vi.useRealTimers();
  });

  it('cancels pending execution when cancel() is called', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('result');

    const { result } = renderHook(() =>
      useDebouncedAsync(fn, { delay: 500 })
    );

    act(() => {
      result.current.execute('call-to-cancel');
    });

    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.loading).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
