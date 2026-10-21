import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVirtualWindow } from '../src/hooks/useVirtualWindow';

describe('useVirtualWindow', () => {
  it('computes total height and initial virtual window correctly', () => {
    const { result } = renderHook(() =>
      useVirtualWindow({
        totalCount: 1000,
        itemHeight: 50,
        containerHeight: 500, // can fit 10 items
        overscan: 2,
      })
    );

    expect(result.current.totalHeight).toBe(50000);
    // At scrollTop = 0, raw range is 0 to 10. With overscan 2, start=0, end=12 -> 13 items
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(12);
    expect(result.current.virtualItems.length).toBe(13);
    expect(result.current.virtualItems[0]).toEqual({
      index: 0,
      start: 0,
      size: 50,
      end: 50,
    });
  });

  it('updates window on scroll events', () => {
    const { result } = renderHook(() =>
      useVirtualWindow({
        totalCount: 500,
        itemHeight: 40,
        containerHeight: 400, // 10 items
        overscan: 2,
      })
    );

    act(() => {
      result.current.onScroll({
        currentTarget: { scrollTop: 800 }, // Item index 20
      });
    });

    // 800 / 40 = 20. start = max(0, 20 - 2) = 18
    expect(result.current.startIndex).toBe(18);
    expect(result.current.virtualItems[0].index).toBe(18);
    expect(result.current.virtualItems[0].start).toBe(18 * 40);
  });

  it('handles variable item heights with function generator', () => {
    const { result } = renderHook(() =>
      useVirtualWindow({
        totalCount: 100,
        itemHeight: (index) => (index % 2 === 0 ? 30 : 60),
        containerHeight: 300,
      })
    );

    // Sum of 50 * 30 + 50 * 60 = 1500 + 3000 = 4500
    expect(result.current.totalHeight).toBe(4500);
    expect(result.current.virtualItems[0].size).toBe(30);
    expect(result.current.virtualItems[1].size).toBe(60);
  });
});
