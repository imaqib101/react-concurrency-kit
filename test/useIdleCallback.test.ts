import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIdleCallback } from '../src';

// In happy-dom, requestIdleCallback is not available, so the hook uses the
// setTimeout(fn, 1) polyfill. All tests drive time with vi.advanceTimersByTime
// and flush the microtask queue with cascaded Promise.resolve() calls.

async function flushAsync(steps = 5): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await Promise.resolve();
  }
}

describe('useIdleCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── basic lifecycle ─────────────────────────────────────────────────────────

  it('starts in "idle" status before any scheduling (autoSchedule=false)', () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: false })
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.isScheduled).toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it('transitions to "scheduled" immediately after autoSchedule mount', () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );
    expect(result.current.status).toBe('scheduled');
    expect(result.current.isScheduled).toBe(true);
  });

  it('runs the task and transitions to "completed" after timer fires', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.runCount).toBe(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('passes a deadline to the task with timeRemaining() and didTimeout', async () => {
    let receivedDeadline: { didTimeout: boolean; timeRemaining: () => number } | null = null;
    renderHook(() =>
      useIdleCallback((d) => { receivedDeadline = d; }, { autoSchedule: true })
    );

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(receivedDeadline).not.toBeNull();
    expect(typeof receivedDeadline!.timeRemaining).toBe('function');
    expect(receivedDeadline!.didTimeout).toBe(false);
  });

  // ── schedule() ────────────────────────────────────────────────────────────

  it('manual schedule() triggers execution', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: false })
    );

    act(() => { result.current.schedule(); });
    expect(result.current.status).toBe('scheduled');

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(result.current.runCount).toBe(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('schedule() is idempotent — calling it twice does not double-schedule', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: false })
    );

    act(() => {
      result.current.schedule();
      result.current.schedule(); // no-op
    });

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(task).toHaveBeenCalledTimes(1);
  });

  // ── cancel() ─────────────────────────────────────────────────────────────

  it('cancel() before timer fires prevents task from running', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );

    act(() => { result.current.cancel(); });
    expect(result.current.status).toBe('cancelled');

    await act(async () => {
      vi.advanceTimersByTime(10);
      await flushAsync(8);
    });

    expect(task).not.toHaveBeenCalled();
  });

  // ── reschedule() ─────────────────────────────────────────────────────────

  it('reschedule() causes exactly one execution', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );

    act(() => { result.current.reschedule(); });
    expect(result.current.status).toBe('scheduled');

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(task).toHaveBeenCalledTimes(1);
  });

  // ── unmount cleanup ───────────────────────────────────────────────────────

  it('cancels the pending task when the component unmounts', async () => {
    const task = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(10);
      await flushAsync(8);
    });

    // Timer was cleared on unmount — task must NOT have been called
    expect(task).not.toHaveBeenCalled();
  });

  // ── isNativeSupported (polyfill path in happy-dom) ────────────────────────

  it('isNativeSupported=false in happy-dom (uses setTimeout polyfill)', () => {
    const { result } = renderHook(() =>
      useIdleCallback(() => Promise.resolve(), { autoSchedule: false })
    );
    // happy-dom does not ship requestIdleCallback
    expect(result.current.isNativeSupported).toBe(false);
  });

  it('isNativeSupported=true when requestIdleCallback is injected at runtime', () => {
    // Inject a minimal stub before rendering
    (globalThis as any).requestIdleCallback = (cb: Function) => {
      return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
    };
    (globalThis as any).cancelIdleCallback = (id: number) => clearTimeout(id);

    const { result } = renderHook(() =>
      useIdleCallback(() => Promise.resolve(), { autoSchedule: false })
    );
    const supported = result.current.isNativeSupported;

    // Cleanup
    delete (globalThis as any).requestIdleCallback;
    delete (globalThis as any).cancelIdleCallback;

    expect(supported).toBe(true);
  });

  // ── runCount increments ────────────────────────────────────────────────────

  it('runCount is 0 before any execution and 1 after first completion', async () => {
    const task = vi.fn();
    const { result } = renderHook(() =>
      useIdleCallback(task, { autoSchedule: true })
    );

    expect(result.current.runCount).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(8);
    });

    expect(result.current.runCount).toBe(1);
  });

  // ── async task support ────────────────────────────────────────────────────

  it('handles an async task and still marks completed', async () => {
    let resolveTask!: () => void;
    const asyncTask = vi.fn(
      () => new Promise<void>((res) => { resolveTask = res; })
    );

    const { result } = renderHook(() =>
      useIdleCallback(asyncTask, { autoSchedule: true })
    );

    // Fire the timer → task starts but is still pending
    await act(async () => {
      vi.advanceTimersByTime(5);
      await flushAsync(4);
    });

    expect(asyncTask).toHaveBeenCalled();

    // Resolve the async task
    await act(async () => {
      resolveTask();
      await flushAsync(8);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.runCount).toBe(1);
  });
});
