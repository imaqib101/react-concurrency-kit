import { useState, useCallback, useRef, useEffect } from 'react';

export type QueueItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface QueueItem<TInput, TOutput> {
  id: string;
  input: TInput;
  status: QueueItemStatus;
  result?: TOutput;
  error?: Error;
  startedAt?: number;
  completedAt?: number;
}

export interface UseAsyncQueueOptions<TInput, TOutput> {
  taskFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  concurrency?: number;
  autoStart?: boolean;
  onItemComplete?: (item: QueueItem<TInput, TOutput>) => void;
  onItemError?: (item: QueueItem<TInput, TOutput>, error: Error) => void;
  onAllComplete?: (items: QueueItem<TInput, TOutput>[]) => void;
}

export interface UseAsyncQueueReturn<TInput, TOutput> {
  items: QueueItem<TInput, TOutput>[];
  isRunning: boolean;
  isPaused: boolean;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  progress: number;
  add: (input: TInput | TInput[]) => string[];
  start: () => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  abortItem: (id: string) => void;
  abortAll: () => void;
  retryFailed: () => void;
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `task_${Date.now()}_${idCounter}`;
}

export function useAsyncQueue<TInput, TOutput>(
  options: UseAsyncQueueOptions<TInput, TOutput>
): UseAsyncQueueReturn<TInput, TOutput> {
  const {
    taskFn,
    concurrency = 2,
    autoStart = true,
    onItemComplete,
    onItemError,
    onAllComplete,
  } = options;

  const [items, setItems] = useState<QueueItem<TInput, TOutput>[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // References to maintain synchronous state during worker loop
  const itemsRef = useRef<QueueItem<TInput, TOutput>[]>([]);
  itemsRef.current = items;

  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;

  const isRunningRef = useRef<boolean>(isRunning);
  isRunningRef.current = isRunning;

  const taskFnRef = useRef(taskFn);
  taskFnRef.current = taskFn;

  const onItemCompleteRef = useRef(onItemComplete);
  onItemCompleteRef.current = onItemComplete;

  const onItemErrorRef = useRef(onItemError);
  onItemErrorRef.current = onItemError;

  const onAllCompleteRef = useRef(onAllComplete);
  onAllCompleteRef.current = onAllComplete;

  const activeControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Ids that have been handed to taskFn. itemsRef lags behind until React
  // re-renders, so this prevents a task from being started twice when
  // processQueue runs several times in between.
  const startedIdsRef = useRef<Set<string>>(new Set());

  const processQueue = useCallback(() => {
    if (isPausedRef.current) return;

    const currentItems = itemsRef.current;
    const activeCount = activeControllersRef.current.size;
    const availableSlots = Math.max(0, concurrency - activeCount);

    if (availableSlots <= 0) return;

    // Find next pending items
    const pendingItems = currentItems.filter(
      (item) => item.status === 'pending' && !startedIdsRef.current.has(item.id)
    );
    if (pendingItems.length === 0) {
      if (activeCount === 0 && isRunningRef.current) {
        isRunningRef.current = false;
        setIsRunning(false);
        if (onAllCompleteRef.current && currentItems.length > 0) {
          onAllCompleteRef.current(currentItems);
        }
      }
      return;
    }

    if (!isRunningRef.current) {
      setIsRunning(true);
    }

    const tasksToStart = pendingItems.slice(0, availableSlots);

    tasksToStart.forEach((task) => {
      const abortController = new AbortController();
      activeControllersRef.current.set(task.id, abortController);
      startedIdsRef.current.add(task.id);

      const startTime = Date.now();

      // Update task status to running
      setItems((prev) =>
        prev.map((it) =>
          it.id === task.id ? { ...it, status: 'running', startedAt: startTime } : it
        )
      );

      taskFnRef
        .current(task.input, abortController.signal)
        .then((result) => {
          activeControllersRef.current.delete(task.id);
          const completedAt = Date.now();
          const updatedItem: QueueItem<TInput, TOutput> = {
            ...task,
            status: 'completed',
            result,
            startedAt: startTime,
            completedAt,
          };

          setItems((prev) => prev.map((it) => (it.id === task.id ? updatedItem : it)));

          if (onItemCompleteRef.current) {
            onItemCompleteRef.current(updatedItem);
          }
        })
        .catch((err: unknown) => {
          activeControllersRef.current.delete(task.id);
          const completedAt = Date.now();
          const isAborted =
            abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError');

          const finalStatus: QueueItemStatus = isAborted ? 'aborted' : 'failed';
          const errorObj = err instanceof Error ? err : new Error(String(err));

          const updatedItem: QueueItem<TInput, TOutput> = {
            ...task,
            status: finalStatus,
            error: errorObj,
            startedAt: startTime,
            completedAt,
          };

          setItems((prev) => prev.map((it) => (it.id === task.id ? updatedItem : it)));

          if (!isAborted && onItemErrorRef.current) {
            onItemErrorRef.current(updatedItem, errorObj);
          }
        })
        .finally(() => {
          // Trigger next cycle
          setTimeout(processQueue, 0);
        });
    });
  }, [concurrency]);

  const add = useCallback(
    (input: TInput | TInput[]): string[] => {
      const inputs = Array.isArray(input) ? input : [input];
      const newItems: QueueItem<TInput, TOutput>[] = inputs.map((inp) => ({
        id: generateId(),
        input: inp,
        status: 'pending',
      }));

      const newIds = newItems.map((it) => it.id);

      setItems((prev) => {
        const next = [...prev, ...newItems];
        itemsRef.current = next;
        return next;
      });

      if (autoStart && !isPausedRef.current) {
        setTimeout(processQueue, 0);
      }

      return newIds;
    },
    [autoStart, processQueue]
  );

  const start = useCallback(() => {
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRunning(true);
    isRunningRef.current = true;
    setTimeout(processQueue, 0);
  }, [processQueue]);

  const pause = useCallback(() => {
    setIsPaused(true);
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
    isPausedRef.current = false;
    setTimeout(processQueue, 0);
  }, [processQueue]);

  const abortItem = useCallback((id: string) => {
    const controller = activeControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      activeControllersRef.current.delete(id);
    }
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, status: 'aborted' as const } : it));
      itemsRef.current = next;
      return next;
    });
  }, []);

  const abortAll = useCallback(() => {
    activeControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    activeControllersRef.current.clear();

    setItems((prev) => {
      const next = prev.map((it) =>
        it.status === 'running' || it.status === 'pending'
          ? { ...it, status: 'aborted' as const }
          : it
      );
      itemsRef.current = next;
      return next;
    });
    setIsRunning(false);
    isRunningRef.current = false;
  }, []);

  const clear = useCallback(() => {
    abortAll();
    itemsRef.current = [];
    startedIdsRef.current.clear();
    setItems([]);
    setIsRunning(false);
    isRunningRef.current = false;
  }, [abortAll]);

  const retryFailed = useCallback(() => {
    itemsRef.current.forEach((it) => {
      if (it.status === 'failed' || it.status === 'aborted') {
        startedIdsRef.current.delete(it.id);
      }
    });
    setItems((prev) =>
      prev.map((it) =>
        it.status === 'failed' || it.status === 'aborted'
          ? { ...it, status: 'pending', error: undefined, result: undefined }
          : it
      )
    );
    if (autoStart && !isPausedRef.current) {
      setTimeout(processQueue, 0);
    }
  }, [autoStart, processQueue]);

  // Cleanup controllers on unmount
  useEffect(() => {
    const controllers = activeControllersRef.current;
    return () => {
      controllers.forEach((controller) => {
        controller.abort();
      });
      controllers.clear();
    };
  }, []);

  const pendingCount = items.filter((it) => it.status === 'pending').length;
  const activeCount = items.filter((it) => it.status === 'running').length;
  const completedCount = items.filter((it) => it.status === 'completed').length;
  const failedCount = items.filter((it) => it.status === 'failed').length;
  const abortedCount = items.filter((it) => it.status === 'aborted').length;

  const total = items.length;
  const finished = completedCount + failedCount + abortedCount;
  const progress = total > 0 ? Math.round((finished / total) * 100) : 0;

  return {
    items,
    isRunning,
    isPaused,
    pendingCount,
    activeCount,
    completedCount,
    failedCount,
    progress,
    add,
    start,
    pause,
    resume,
    clear,
    abortItem,
    abortAll,
    retryFailed,
  };
}
