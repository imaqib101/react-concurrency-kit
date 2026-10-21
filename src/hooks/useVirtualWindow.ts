import { useState, useCallback, useMemo } from 'react';

export interface UseVirtualWindowOptions {
  totalCount: number;
  itemHeight: number | ((index: number) => number);
  containerHeight: number;
  overscan?: number;
  initialScrollTop?: number;
}

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
  end: number;
}

export interface UseVirtualWindowReturn {
  virtualItems: VirtualItem[];
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  onScroll: (e: React.UIEvent<HTMLElement> | { currentTarget: { scrollTop: number } }) => void;
  scrollToIndex: (index: number) => number;
}

export function useVirtualWindow(options: UseVirtualWindowOptions): UseVirtualWindowReturn {
  const {
    totalCount,
    itemHeight,
    containerHeight,
    overscan = 3,
    initialScrollTop = 0,
  } = options;

  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const isFunctionHeight = typeof itemHeight === 'function';

  // Compute item offsets & sizes
  const { offsets, sizes, totalHeight } = useMemo(() => {
    const itemOffsets: number[] = new Array(totalCount);
    const itemSizes: number[] = new Array(totalCount);
    let runningOffset = 0;

    for (let i = 0; i < totalCount; i++) {
      const size = isFunctionHeight ? (itemHeight as (idx: number) => number)(i) : (itemHeight as number);
      itemOffsets[i] = runningOffset;
      itemSizes[i] = size;
      runningOffset += size;
    }

    return {
      offsets: itemOffsets,
      sizes: itemSizes,
      totalHeight: runningOffset,
    };
  }, [totalCount, itemHeight, isFunctionHeight]);

  // Binary search to find start item
  const findStartIndex = useCallback(
    (top: number) => {
      let low = 0;
      let high = totalCount - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const itemStart = offsets[mid];
        const itemEnd = itemStart + sizes[mid];

        if (itemEnd < top) {
          low = mid + 1;
        } else if (itemStart > top) {
          high = mid - 1;
        } else {
          return mid;
        }
      }

      return Math.max(0, Math.min(low, totalCount - 1));
    },
    [offsets, sizes, totalCount]
  );

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    if (totalCount === 0 || containerHeight <= 0) {
      return { startIndex: 0, endIndex: 0, virtualItems: [] };
    }

    const rawStart = findStartIndex(scrollTop);
    const start = Math.max(0, rawStart - overscan);

    let end = rawStart;
    const viewBottom = scrollTop + containerHeight;

    while (end < totalCount - 1 && offsets[end] < viewBottom) {
      end++;
    }
    end = Math.min(totalCount - 1, end + overscan);

    const items: VirtualItem[] = [];
    for (let i = start; i <= end; i++) {
      items.push({
        index: i,
        start: offsets[i],
        size: sizes[i],
        end: offsets[i] + sizes[i],
      });
    }

    return {
      startIndex: start,
      endIndex: end,
      virtualItems: items,
    };
  }, [totalCount, containerHeight, scrollTop, offsets, sizes, overscan, findStartIndex]);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLElement> | { currentTarget: { scrollTop: number } }) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
    []
  );

  const scrollToIndex = useCallback(
    (index: number): number => {
      const targetIndex = Math.max(0, Math.min(index, totalCount - 1));
      const targetOffset = offsets[targetIndex] || 0;
      setScrollTop(targetOffset);
      return targetOffset;
    },
    [offsets, totalCount]
  );

  return {
    virtualItems,
    totalHeight,
    startIndex,
    endIndex,
    onScroll,
    scrollToIndex,
  };
}
