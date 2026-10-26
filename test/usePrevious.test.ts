import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePrevious } from '../src/hooks/usePrevious';

describe('usePrevious', () => {
  it('returns undefined on initial render and tracks previous values on updates', () => {
    const { result, rerender } = renderHook(({ count }) => usePrevious(count), {
      initialProps: { count: 0 },
    });

    expect(result.current).toBeUndefined();

    rerender({ count: 1 });
    expect(result.current).toBe(0);

    rerender({ count: 5 });
    expect(result.current).toBe(1);

    rerender({ count: 5 });
    expect(result.current).toBe(5);
  });
});
