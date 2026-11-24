import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedAsync } from '../src/useDebouncedAsync';

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
});
