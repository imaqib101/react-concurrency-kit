import { useEffect, useRef, useCallback, useState } from 'react';

export interface IdleCallbackDeadline {
  readonly didTimeout: boolean;
  timeRemaining: () => number;
}

export type IdleTask = (deadline: IdleCallbackDeadline) => void | Promise<void>;

export interface UseIdleCallbackOptions {
  /**
   * Maximum milliseconds to wait before the browser forces the callback to run,
   * even if the main thread is busy. Maps to RequestIdleCallbackOptions.timeout.
   * Default: 2000ms.
   */
  timeout?: number;
  /**
   * Whether to schedule the idle task automatically on mount.
   * Default: true.
   */
  autoSchedule?: boolean;
  /**
   * Whether to re-schedule automatically after each execution completes.
   * Useful for recurring background work (e.g. flushing analytics batches).
   * Default: false.
   */
  repeat?: boolean;
  /**
   * Minimum idle time (ms) required before executing the task.
   * If the deadline reports less remaining time than this, defer to the next
   * idle period. Ignored in polyfill (setTimeout) mode.
   * Default: 0.
   */
  minIdleMs?: number;
}

export type IdleCallbackStatus = 'idle' | 'scheduled' | 'running' | 'completed' | 'cancelled';

export interface UseIdleCallbackReturn {
  /** Current lifecycle status of the idle task. */
  status: IdleCallbackStatus;
  /** Whether a callback is currently scheduled with the browser scheduler. */
  isScheduled: boolean;
  /** Whether the task is currently executing. */
  isRunning: boolean;
  /** Number of times this task has successfully completed. */
  runCount: number;
  /**
   * Whether the environment supports requestIdleCallback natively.
   * When false, a setTimeout(fn, 1) polyfill is used.
   */
  isNativeSupported: boolean;
  /** Manually schedule the task (no-op if already scheduled). */
  schedule: () => void;
  /** Cancel a pending scheduled task. Has no effect if not scheduled. */
  cancel: () => void;
  /** Cancel any pending schedule, then immediately re-schedule. */
  reschedule: () => void;
}

// ── Runtime helpers (checked every call, not at module load) ─────────────────

type RICHandle = number;

/** True if requestIdleCallback exists at call time (runtime check). */
function hasRIC(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).requestIdleCallback === 'function'
  );
}

function scheduleIdle(
  cb: (deadline: IdleCallbackDeadline) => void,
  timeout: number
): RICHandle {
  if (hasRIC()) {
    return (globalThis as unknown as { requestIdleCallback: (cb: (d: IdleCallbackDeadline) => void, opts: { timeout: number }) => number })
      .requestIdleCallback(cb, { timeout });
  }
  // Polyfill for Safari / SSR / test environments
  const start = Date.now();
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, 1) as unknown as RICHandle;
}

function cancelIdle(handle: RICHandle): void {
  if (hasRIC()) {
    (globalThis as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle);
  } else {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Schedule a task to run during browser idle periods using `requestIdleCallback`,
 * with a `setTimeout(fn, 1)` polyfill for Safari and SSR environments.
 *
 * @example
 * const { schedule, cancel, status } = useIdleCallback(
 *   (deadline) => {
 *     while (deadline.timeRemaining() > 5 && workQueue.length) {
 *       processNextItem(workQueue.shift());
 *     }
 *   },
 *   { timeout: 3000, repeat: true }
 * );
 */
export function useIdleCallback(
  task: IdleTask,
  options: UseIdleCallbackOptions = {}
): UseIdleCallbackReturn {
  const {
    timeout = 2000,
    autoSchedule = true,
    repeat = false,
    minIdleMs = 0,
  } = options;

  const [status, setStatus] = useState<IdleCallbackStatus>('idle');
  const [runCount, setRunCount] = useState(0);

  // Stable refs — task may change between renders
  const taskRef = useRef<IdleTask>(task);
  taskRef.current = task;

  const handleRef = useRef<RICHandle | null>(null);
  const isMountedRef = useRef(true);
  const isRunningRef = useRef(false);

  const cancel = useCallback(() => {
    if (handleRef.current !== null) {
      cancelIdle(handleRef.current);
      handleRef.current = null;
    }
    if (isMountedRef.current) {
      setStatus('cancelled');
    }
  }, []);

  const schedule = useCallback(() => {
    // No double-scheduling
    if (handleRef.current !== null) return;

    if (isMountedRef.current) {
      setStatus('scheduled');
    }

    const runTask = async (deadline: IdleCallbackDeadline): Promise<void> => {
      handleRef.current = null;

      // Defer if not enough idle time and not forced by timeout expiry
      if (!deadline.didTimeout && deadline.timeRemaining() < minIdleMs) {
        if (isMountedRef.current && !isRunningRef.current) {
          handleRef.current = scheduleIdle(runTask, timeout);
        }
        return;
      }

      if (!isMountedRef.current) return;

      isRunningRef.current = true;
      setStatus('running');

      try {
        await taskRef.current(deadline);
      } finally {
        isRunningRef.current = false;
        if (isMountedRef.current) {
          setRunCount((prev) => prev + 1);
          setStatus('completed');
          if (repeat) {
            handleRef.current = scheduleIdle(runTask, timeout);
          }
        }
      }
    };

    handleRef.current = scheduleIdle(runTask, timeout);
  }, [timeout, minIdleMs, repeat]); // eslint-disable-line react-hooks/exhaustive-deps

  const reschedule = useCallback(() => {
    cancel();
    handleRef.current = null; // ensure schedule() sees no active handle
    schedule();
  }, [cancel, schedule]);

  useEffect(() => {
    isMountedRef.current = true;
    if (autoSchedule) {
      schedule();
    }
    return () => {
      isMountedRef.current = false;
      if (handleRef.current !== null) {
        cancelIdle(handleRef.current);
        handleRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    isScheduled: status === 'scheduled',
    isRunning: status === 'running',
    runCount,
    isNativeSupported: hasRIC(),
    schedule,
    cancel,
    reschedule,
  };
}
