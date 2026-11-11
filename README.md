# ⚡ @imaqib101/react-concurrency-kit

[![CI](https://github.com/imaqib101/react-concurrency-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/imaqib101/react-concurrency-kit/actions)
[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue?style=flat-square&logo=npm)](https://github.com/imaqib101/react-concurrency-kit)
[![React 18 & 19 Ready](https://img.shields.io/badge/React-18%20%7C%2019-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

> **Production React 18 & 19 custom hooks & concurrency primitives for resilient data streaming, optimistic UI mutations with rollback guards, and high-performance layout virtualization.**

---

## 🎯 Motivation & Design Philosophy

Modern enterprise web frontends demand seamless responsiveness under unpredictable network conditions, high-frequency realtime streams (SSE / WebSockets), and high-cardinality UI rendering. 

`react-concurrency-kit` provides production-hardened primitives engineered for:
1. **Zero Jank & Concurrent Safety:** Seamlessly interoperates with React 18/19 concurrent rendering, transitions, and abort signals.
2. **Deterministic Optimism:** Instant UI updates with atomic rollback guarantees upon network rejection.
3. **Resilient Network Primitives:** Auto-reconnecting Server-Sent Event (SSE) streams with exponential jitter backoff and heartbeat recovery.
4. **Zero Overhead Virtualization:** Lightweight list virtualization computed via binary search offsets without heavy third-party bundle bloat.

---

## 📦 Installation

```bash
npm install @imaqib101/react-concurrency-kit
# or
pnpm add @imaqib101/react-concurrency-kit
# or
yarn add @imaqib101/react-concurrency-kit
```

---

## 🚀 Primitives Overview

### 1. `useOptimisticMutation`
Performs optimistic UI state transitions before server resolution, providing automatic rollback on failure, cancellation signals, and execution status.

```tsx
import { useOptimisticMutation } from '@imaqib101/react-concurrency-kit';

function TaskList({ initialTasks }) {
  const { data: tasks, mutate, isMutating, isOptimistic } = useOptimisticMutation(initialTasks, {
    // 1. Optimistic transition applied instantly
    optimisticUpdate: (current, newTask) => [
      ...current,
      { ...newTask, id: 'temp-id', pending: true }
    ],
    // 2. Real async mutation
    mutationFn: async (newTask, signal) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
        signal,
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    },
    // 3. Rollback occurs automatically if mutationFn rejects
    rollbackOnError: true,
  });

  return (
    <div>
      <button onClick={() => mutate({ title: 'Deploy to Edge' })}>Add Task</button>
      {isOptimistic && <span className="badge">Syncing...</span>}
      <ul>
        {tasks.map(t => <li key={t.id}>{t.title}</li>)}
      </ul>
    </div>
  );
}
```

---

### 2. `useEventStream`
Production Server-Sent Events (SSE) streaming hook with built-in heartbeat monitor, automatic reconnect with exponential backoff & jitter, and historical window buffering.

```tsx
import { useEventStream } from '@imaqib101/react-concurrency-kit';

function MetricsStream() {
  const { status, data, history, disconnect, connect } = useEventStream<{ cpu: number; mem: number }>({
    url: '/api/v1/metrics/stream',
    heartbeatTimeoutMs: 30000,
    maxRetries: 5,
    parser: (raw) => JSON.parse(raw),
    onMessage: (metric) => console.log('Live tick:', metric),
  });

  return (
    <div>
      <div className={`status-dot ${status}`} />
      <p>Status: {status}</p>
      {data && <div>CPU: {data.cpu}% | Memory: {data.mem}MB</div>}
    </div>
  );
}
```

---

### 3. `useVirtualWindow`
High-speed virtual window calculator utilizing binary-search index computation. Supports both fixed and variable element heights with custom overscan buffers.

```tsx
import { useVirtualWindow } from '@imaqib101/react-concurrency-kit';

function HeavyLogViewer({ logs }) {
  const { virtualItems, totalHeight, onScroll } = useVirtualWindow({
    totalCount: logs.length,
    itemHeight: 36,
    containerHeight: 600,
    overscan: 4,
  });

  return (
    <div style={{ height: 600, overflowY: 'auto' }} onScroll={onScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ index, start, size }) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: start,
              height: size,
              width: '100%',
            }}
          >
            {logs[index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### 4. `useDebouncedCallback`
Configurable debouncer with leading/trailing guarantees, max-wait deadline execution, and manual flush/cancel APIs.

```tsx
import { useDebouncedCallback } from '@imaqib101/react-concurrency-kit';

function SearchInput({ onSearch }) {
  const debouncedSearch = useDebouncedCallback(
    (query: string) => onSearch(query),
    300,
    { maxWaitMs: 1000 }
  );

  return (
    <input
      type="text"
      placeholder="Search..."
      onChange={(e) => debouncedSearch(e.target.value)}
    />
  );
}
```

---

### 5. `useThrottledCallback`
High-performance throttle hook with configurable leading/trailing execution edges, manual flush, cancel, and pending inspection for high-frequency window scroll, resize, or viewport tracking events.

```tsx
import { useThrottledCallback } from '@imaqib101/react-concurrency-kit';

function ViewportTracker({ onPositionChange }) {
  const throttledUpdate = useThrottledCallback(
    (scrollPos: number) => onPositionChange(scrollPos),
    100,
    { leading: true, trailing: true }
  );

  return (
    <div onScroll={(e) => throttledUpdate(e.currentTarget.scrollTop)}>
      {/* Content */}
    </div>
  );
}
```

---

### 6. `useAsyncQueue`
Concurrency-limited asynchronous task worker queue with batch submission, dynamic task cancellation via `AbortSignal`, pause/resume capabilities, failure retries, and real-time progress tracking:

```tsx
import { useAsyncQueue } from '@imaqib101/react-concurrency-kit';

function BatchUploader({ files }) {
  const {
    items,
    progress,
    activeCount,
    pendingCount,
    add,
    pause,
    resume,
    abortAll,
  } = useAsyncQueue<File, UploadResult>({
    taskFn: async (file, signal) => uploadFileToServer(file, signal),
    concurrency: 3, // maximum 3 concurrent uploads
    autoStart: true,
  });

  return (
    <div>
      <button onClick={() => add(files)}>Queue {files.length} Files</button>
      <div>Progress: {progress}% (Active: {activeCount}, Queued: {pendingCount})</div>
      <button onClick={pause}>Pause</button>
      <button onClick={resume}>Resume</button>
      <button onClick={abortAll}>Cancel All</button>
    </div>
  );
}
```

---

### 7. `useDebouncedState`
Dual-state synchronization: an immediate value for zero-lag controlled UI inputs, alongside a debounced value that settles after a specified delay for expensive operations, complete with `flush`, `cancel`, `isPending`, and `reset` controls.

```tsx
import { useDebouncedState } from '@imaqib101/react-concurrency-kit';

function SearchFilter({ onFilterChange }) {
  const [debouncedQuery, setQuery, { immediate, isPending, flush, reset }] = useDebouncedState('', 300);

  return (
    <div>
      <input
        type="text"
        value={immediate}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to filter..."
      />
      {isPending() && <span>Typing...</span>}
      <button onClick={flush}>Search Now</button>
      <button onClick={() => reset('')}>Clear</button>
    </div>
  );
}
```

---

### 8. `useThrottledState`
Dual-state synchronization for high-frequency continuous inputs (scroll positions, viewport dimensions, slider scrubs): provides an immediate value for 60fps local UI rendering alongside a throttled state updated at most once every `waitMs` milliseconds with lifecycle handles (`flush`, `cancel`, `isPending`, `reset`).

```tsx
import { useThrottledState } from '@imaqib101/react-concurrency-kit';

function ScrollCoordinator() {
  const [throttledY, setScrollY, { immediate, isPending, flush, reset }] = useThrottledState(0, 100);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollY(e.currentTarget.scrollTop);
  };

  return (
    <div>
      <p>Live: {immediate}px | Throttled API sync: {throttledY}px</p>
      {isPending() && <span>Syncing...</span>}
      <button onClick={flush}>Sync Immediately</button>
      <button onClick={() => reset(0)}>Reset</button>
    </div>
  );
}
```

---

### 9. `useAsyncState`
Robust promise execution manager featuring native `AbortSignal` cancellation, race condition prevention (stale requests discarded), configurable timeouts, and full status state flags (`idle`, `pending`, `success`, `error`).

```tsx
import { useAsyncState } from '@imaqib101/react-concurrency-kit';

function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, execute, abort, reset } = useAsyncState(
    async (signal, id: string) => {
      const res = await fetch(`/api/users/${id}`, { signal });
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
    {
      timeoutMs: 8000,
      onSuccess: (user) => console.log('Loaded:', user),
    }
  );

  return (
    <div>
      <button onClick={() => execute(userId)}>Fetch Profile</button>
      <button onClick={abort} disabled={!isLoading}>Cancel</button>
      <button onClick={reset}>Clear</button>

      {isLoading && <p>Loading user data...</p>}
      {isError && <p>Error: {error?.message}</p>}
      {data && <div>Name: {data.name}</div>}
    </div>
  );
}
```

---

### 10. `useToggle`
Ergonomic boolean toggle state manager with support for explicit truthy/falsy overrides.

```tsx
import { useToggle } from '@imaqib101/react-concurrency-kit';

function ModalToggle() {
  const [isOpen, toggle] = useToggle(false);

  return (
    <div>
      <button onClick={() => toggle()}>Toggle</button>
      <button onClick={() => toggle(true)}>Open</button>
      <button onClick={() => toggle(false)}>Close</button>
      {isOpen && <div>Modal Content</div>}
    </div>
  );
}
```

---

### 11. `useResilientPolling`
Production-grade polling primitive with automatic document visibility pausing (`visibilitychange`), offline awareness (`navigator.onLine`), exponential backoff with jitter on network degradation, per-request abort timeouts, and granular execution lifecycle controls.

```tsx
import { useResilientPolling } from '@imaqib101/react-concurrency-kit';

function DeploymentMonitor({ buildId }: { buildId: string }) {
  const {
    data: status,
    isPolling,
    isFetching,
    isPaused,
    pollCount,
    failureCount,
    pause,
    resume,
    refetch,
  } = useResilientPolling(
    async (signal) => {
      const res = await fetch(`/api/deployments/${buildId}/status`, { signal });
      if (!res.ok) throw new Error('Failed to retrieve deployment health');
      return res.json();
    },
    {
      intervalMs: 4000,
      autoPauseOnHidden: true, // Pauses timer when user switches browser tabs
      autoPauseOnOffline: true, // Pauses when device loses network
      retryDelayMs: 1500,
      backoffMultiplier: 2,
      maxRetries: 5,
      timeoutMs: 6000,
      onSuccess: (data) => {
        if (data.status === 'READY') console.log('Deployment live!');
      },
      onError: (err, retries) => {
        console.warn(`Polling attempt failed (${retries}):`, err.message);
      },
    }
  );

  return (
    <div>
      <p>Status: {status?.state ?? 'Checking...'} (Polls: {pollCount})</p>
      {isPaused && <span className="badge-warning">Paused (Background tab or offline)</span>}
      {isFetching && <span className="spinner">Fetching...</span>}
      <button onClick={() => refetch()}>Refresh Now</button>
      <button onClick={isPaused ? resume : pause}>{isPaused ? 'Resume' : 'Pause'}</button>
    </div>
  );
}
```

---

Every hook is validated with 100% test coverage using **Vitest** and **@testing-library/react** in a happy-dom environment.

```bash
# Run unit tests
npm test

# Run type check
npm run typecheck

# Build bundle
npm run build
```

---

## 👤 Author & Maintainer

**Mohammed Aqib**  
- GitHub: [@imaqib101](https://github.com/imaqib101)  
- Location: Bengaluru, India  
- Focus: Senior Full-Stack & Frontend Architecture (React, Vue 3, TypeScript, Distributed Systems)

---

## 📄 License

MIT © [Mohammed Aqib](https://github.com/imaqib101)
