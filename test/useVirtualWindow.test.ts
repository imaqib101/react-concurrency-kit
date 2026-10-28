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

describe('useVirtualWindow edge cases', () => {
  it('supports variable item heights', () => {
    const { result } = renderHook(() =>
      useVirtualWindow({
        totalCount: 4,
        itemHeight: (i) => (i + 1) * 10, // 10, 20, 30, 40
        containerHeight: 100,
        overscan: 0,
      })
    );
    expect(result.current.totalHeight).toBe(100);
    expect(result.current.virtualItems.map((v) => [v.start, v.size])).toEqual([
      [0, 10],
      [10, 20],
      [30, 30],
      [60, 40],
    ]);
  });

  it('returns an empty window for zero items or zero container height', () => {
    const empty = renderHook(() =>
      useVirtualWindow({ totalCount: 0, itemHeight: 10, containerHeight: 100 })
    );
    expect(empty.result.current.virtualItems).toEqual([]);
    expect(empty.result.current.totalHeight).toBe(0);

    const hidden = renderHook(() =>
      useVirtualWindow({ totalCount: 10, itemHeight: 10, containerHeight: 0 })
    );
    expect(hidden.result.current.virtualItems).toEqual([]);
  });

  it('scrollToIndex clamps the index and returns the target offset', () => {
    const { result } = renderHook(() =>
      useVirtualWindow({ totalCount: 10, itemHeight: 20, containerHeight: 60, overscan: 0 })
    );
    let offset = -1;
    act(() => {
      offset = result.current.scrollToIndex(5);
    });
    expect(offset).toBe(100);
    expect(result.current.virtualItems[0].index).toBe(5);

    act(() => {
      offset = result.current.scrollToIndex(999);
    });
    expect(offset).toBe(180);
    act(() => {
      offset = result.current.scrollToIndex(-3);
    });
    expect(offset).toBe(0);
  });
});
