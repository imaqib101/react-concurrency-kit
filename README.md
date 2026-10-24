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

## 🧪 Testing & Quality Suite

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
