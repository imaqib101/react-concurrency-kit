import { useState, useEffect, useRef, useCallback } from 'react';

export type PollingStatus = 'idle' | 'polling' | 'paused' | 'error';

export interface UseResilientPollingOptions<TData> {
  /**
   * Interval in milliseconds between poll executions.
   * Default: 5000ms.
   */
  intervalMs?: number;
  /**
   * Initial data before the first successful fetch.
   */
  initialData?: TData;
  /**
   * Whether polling is enabled. If false, stays in 'idle' state.
   * Default: true.
   */
  enabled?: boolean;
  /**
   * Whether to run the polling function immediately on start.
   * Default: true.
   */
  immediate?: boolean;
  /**
   * Automatically pause polling when the browser tab/document is hidden.
   * Resumes and triggers a fresh poll when the tab becomes visible again.
   * Default: true.
   */
  autoPauseOnHidden?: boolean;
  /**
   * Automatically pause polling when the browser is offline (`navigator.onLine === false`).
   * Resumes immediately when connectivity is restored.
   * Default: true.
   */
  autoPauseOnOffline?: boolean;
  /**
   * Maximum consecutive errors allowed before polling stops automatically.
   * Default: Infinity (does not stop on errors).
   */
  maxRetries?: number;
  /**
   * Base retry delay in milliseconds on failure before retrying.
   * Default: 1000ms.
   */
  retryDelayMs?: number;
  /**
   * Multiplier applied to retry delay on consecutive failures (exponential backoff).
   * Default: 1.5.
   */
  backoffMultiplier?: number;
  /**
   * Maximum cap for exponential backoff delay in milliseconds.
   * Default: 30000ms (30s).
   */
  maxRetryDelayMs?: number;
  /**
   * Timeout in milliseconds for each individual poll execution before aborting.
   */
  timeoutMs?: number;
  /**
   * Callback invoked on successful resolution.
   */
  onSuccess?: (data: TData) => void;
  /**
   * Callback invoked on error.
   */
  onError?: (error: Error, consecutiveFailures: number) => void;
  /**
   * Callback invoked if maxRetries is exceeded.
   */
  onMaxRetriesExceeded?: (error: Error) => void;
}

export interface UseResilientPollingReturn<TData> {
  /**
   * The latest resolved data from polling.
   */
  data: TData | undefined;
  /**
   * The latest error encountered during polling, or null.
   */
  error: Error | null;
  /**
   * High-level polling lifecycle status.
   */
  status: PollingStatus;
  /**
   * Whether polling loop is currently active (not stopped or disabled).
   */
  isPolling: boolean;
  /**
   * Whether an async polling request is currently in-flight.
   */
  isFetching: boolean;
  /**
   * Whether polling is temporarily paused (e.g., hidden document, offline, or explicit pause).
   */
  isPaused: boolean;
  /**
   * Count of total successful polls.
   */
  pollCount: number;
  /**
   * Current number of consecutive failures.
   */
  failureCount: number;
  /**
   * Unix timestamp of the last successful poll, or null.
   */
  lastSuccessAt: number | null;
  /**
   * Start or restart polling.
   */
  start: () => void;
  /**
   * Stop polling completely and abort any in-flight execution.
   */
  stop: () => void;
  /**
   * Temporarily pause polling without resetting counts or data.
   */
  pause: () => void;
  /**
   * Resume polling if paused.
   */
  resume: () => void;
  /**
   * Trigger an immediate poll execution manually.
   */
  refetch: () => Promise<TData | undefined>;
  /**
   * Reset data, errors, and counters back to their initial states.
   */
  reset: () => void;
}

/**
 * Resilient, enterprise-grade polling hook with automatic document visibility pause,
 * offline awareness, exponential backoff with jitter on error, and AbortSignal cancellation.
 */
export function useResilientPolling<TData>(
  pollingFn: (signal: AbortSignal) => Promise<TData>,
  options: UseResilientPollingOptions<TData> = {}
): UseResilientPollingReturn<TData> {
  const {
    intervalMs = 5000,
    initialData,
    enabled = true,
    immediate = true,
    autoPauseOnHidden = true,
    autoPauseOnOffline = true,
    maxRetries,
    retryDelayMs = 1000,
    backoffMultiplier = 1.5,
    maxRetryDelayMs = 30000,
    timeoutMs,
  } = options;

  const [data, setData] = useState<TData | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<PollingStatus>(enabled ? 'polling' : 'idle');
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [pollCount, setPollCount] = useState<number>(0);
  const [failureCount, setFailureCount] = useState<number>(0);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  // Store mutable references
  const fnRef = useRef(pollingFn);
  fnRef.current = pollingFn;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const activeRef = useRef<boolean>(enabled);
  const pausedRef = useRef<boolean>(false);
  const failureCountRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const abortInFlight = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    inFlightRef.current = false;
  }, []);

  // Compute next schedule delay
  const getNextDelay = useCallback((currentFailures: number) => {
    if (currentFailures <= 0) {
      return intervalMs;
    }
    const exponential = retryDelayMs * Math.pow(backoffMultiplier, currentFailures - 1);
    // Add 10% jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponential;
    const computed = exponential + jitter;
    return Math.min(computed, maxRetryDelayMs);
  }, [intervalMs, retryDelayMs, backoffMultiplier, maxRetryDelayMs]);

  // Execute a single poll tick
  const executePoll = useCallback(async (): Promise<TData | undefined> => {
    if (!activeRef.current || pausedRef.current) {
      return undefined;
    }

    // Prevent overlapping concurrent executions
    if (inFlightRef.current) {
      abortInFlight();
    }

    clearTimer();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;
    setIsFetching(true);

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        controller.abort(new Error(`Polling timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    try {
      const result = await fnRef.current(controller.signal);

      // Verify controller wasn't aborted or supersceded
      if (abortControllerRef.current === controller) {
        setData(result);
        setError(null);
        failureCountRef.current = 0;
        setFailureCount(0);
        setPollCount((prev) => prev + 1);
        const now = Date.now();
        setLastSuccessAt(now);
        setStatus('polling');

        if (optionsRef.current.onSuccess) {
          optionsRef.current.onSuccess(result);
        }

        // Schedule next poll interval if still active and not paused
        if (activeRef.current && !pausedRef.current) {
          timerRef.current = setTimeout(() => {
            void executePoll();
          }, intervalMs);
        }

        return result;
      }
    } catch (err: unknown) {
      if (abortControllerRef.current === controller) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        failureCountRef.current += 1;
        const currentFailures = failureCountRef.current;
        setFailureCount(currentFailures);
        setError(errorObj);

        if (optionsRef.current.onError) {
          optionsRef.current.onError(errorObj, currentFailures);
        }

        // Check max retries threshold
        if (maxRetries !== undefined && currentFailures >= maxRetries) {
          setStatus('error');
          activeRef.current = false;
          if (optionsRef.current.onMaxRetriesExceeded) {
            optionsRef.current.onMaxRetriesExceeded(errorObj);
          }
          return undefined;
        }

        // Schedule retry with exponential backoff
        if (activeRef.current && !pausedRef.current) {
          const delay = getNextDelay(currentFailures);
          timerRef.current = setTimeout(() => {
            void executePoll();
          }, delay);
        }
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        inFlightRef.current = false;
        setIsFetching(false);
      }
    }

    return undefined;
  }, [clearTimer, abortInFlight, intervalMs, timeoutMs, maxRetries, getNextDelay]);

  // Controls
  const start = useCallback(() => {
    activeRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setStatus('polling');
    void executePoll();
  }, [executePoll]);

  const stop = useCallback(() => {
    activeRef.current = false;
    pausedRef.current = false;
    setIsPaused(false);
    clearTimer();
    abortInFlight();
    setIsFetching(false);
    setStatus('idle');
  }, [clearTimer, abortInFlight]);

  const pause = useCallback(() => {
    if (!activeRef.current) return;
    pausedRef.current = true;
    setIsPaused(true);
    clearTimer();
    abortInFlight();
    setIsFetching(false);
    setStatus('paused');
  }, [clearTimer, abortInFlight]);

  const resume = useCallback(() => {
    if (!activeRef.current) return;
    pausedRef.current = false;
    setIsPaused(false);
    setStatus('polling');
    void executePoll();
  }, [executePoll]);

  const refetch = useCallback(async (): Promise<TData | undefined> => {
    return executePoll();
  }, [executePoll]);

  const reset = useCallback(() => {
    stop();
    setData(initialData);
    setError(null);
    setPollCount(0);
    failureCountRef.current = 0;
    setFailureCount(0);
    setLastSuccessAt(null);
    setStatus('idle');
  }, [stop, initialData]);

  // Lifecycle effect for enabled / mount / interval changes
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    activeRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setStatus('polling');

    if (immediate) {
      void executePoll();
    } else {
      clearTimer();
      timerRef.current = setTimeout(() => {
        void executePoll();
      }, intervalMs);
    }

    return () => {
      clearTimer();
      abortInFlight();
    };
  }, [enabled, intervalMs, immediate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Visibility change listener
  useEffect(() => {
    if (!autoPauseOnHidden || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (activeRef.current && !pausedRef.current) {
          pause();
          // Keep activeRef true so it resumes on visible
          activeRef.current = true;
        }
      } else {
        if (activeRef.current && pausedRef.current) {
          resume();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoPauseOnHidden, pause, resume]);

  // Network online/offline listener
  useEffect(() => {
    if (!autoPauseOnOffline || typeof window === 'undefined') return;

    const handleOffline = () => {
      if (activeRef.current && !pausedRef.current) {
        pause();
        activeRef.current = true;
      }
    };

    const handleOnline = () => {
      if (activeRef.current && pausedRef.current) {
        resume();
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [autoPauseOnOffline, pause, resume]);

  return {
    data,
    error,
    status,
    isPolling: status === 'polling',
    isFetching,
    isPaused,
    pollCount,
    failureCount,
    lastSuccessAt,
    start,
    stop,
    pause,
    resume,
    refetch,
    reset,
  };
}
