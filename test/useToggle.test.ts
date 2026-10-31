import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useToggle } from '../src';

describe('useToggle', () => {
  it('initializes with default value and toggles correctly', () => {
    const { result } = renderHook(() => useToggle(false));
    const [value, toggle] = result.current;
    expect(value).toBe(false);

    act(() => {
      toggle();
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      toggle(false);
    });
    expect(result.current[0]).toBe(false);
  });

  it('supports explicit boolean override', () => {
    const { result } = renderHook(() => useToggle(true));
    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
  });
});
