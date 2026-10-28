import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventStream } from '../src/hooks/useEventStream';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  close() {
    this.readyState = 2;
  }
}

describe('useEventStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error mock
    global.EventSource = MockEventSource;
  });

  it('connects to event source and receives streaming events', () => {
    const { result } = renderHook(() =>
      useEventStream<{ id: number; message: string }>({
        url: 'https://api.example.com/stream',
        parser: (data) => JSON.parse(data),
      })
    );

    expect(result.current.status).toBe('connecting');
    const latestInstance = MockEventSource.instances[MockEventSource.instances.length - 1];
    expect(latestInstance).toBeDefined();

    // Open connection
    act(() => {
      latestInstance.simulateOpen();
    });

    expect(result.current.status).toBe('open');

    // Emit event
    act(() => {
      latestInstance.simulateMessage(JSON.stringify({ id: 1, message: 'hello' }));
    });

    expect(result.current.data).toEqual({ id: 1, message: 'hello' });
    expect(result.current.history).toHaveLength(1);

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe('closed');
  });

  describe('resilience', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const lastInstance = () => MockEventSource.instances[MockEventSource.instances.length - 1];

    it('reconnects with backoff after an error and resets retries once open', () => {
      const { result } = renderHook(() =>
        useEventStream({ url: '/s', initialRetryDelayMs: 100, maxRetryDelayMs: 1000 })
      );
      act(() => lastInstance().simulateError());
      expect(result.current.status).toBe('error');
      expect(MockEventSource.instances).toHaveLength(1);

      // First retry delay is 100ms plus up to 200ms jitter.
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(MockEventSource.instances).toHaveLength(2);
      expect(result.current.status).toBe('connecting');

      act(() => lastInstance().simulateOpen());
      expect(result.current.status).toBe('open');
      expect(result.current.error).toBeNull();
    });

    it('gives up and reports closed after maxRetries', () => {
      const { result } = renderHook(() =>
        useEventStream({ url: '/s', maxRetries: 2, initialRetryDelayMs: 10, maxRetryDelayMs: 50 })
      );
      for (let i = 0; i < 3; i++) {
        act(() => lastInstance().simulateError());
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
      // 1 initial connection + 2 retries
      expect(MockEventSource.instances).toHaveLength(3);
      expect(result.current.status).toBe('closed');
    });

    it('does not reconnect after a manual disconnect', () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useEventStream({ url: '/s', onClose }));
      act(() => result.current.disconnect());
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(MockEventSource.instances).toHaveLength(1);
      expect(result.current.status).toBe('closed');
      expect(onClose).toHaveBeenCalled();
    });

    it('reconnects when no message arrives within the heartbeat window', () => {
      const { result } = renderHook(() =>
        useEventStream({ url: '/s', heartbeatTimeoutMs: 1000, initialRetryDelayMs: 10 })
      );
      act(() => lastInstance().simulateOpen());
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.status).toBe('error');
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(MockEventSource.instances).toHaveLength(2);
    });

    it('caps history at maxHistoryLength and clearHistory empties it', () => {
      const { result } = renderHook(() => useEventStream({ url: '/s', maxHistoryLength: 3 }));
      act(() => lastInstance().simulateOpen());
      for (const m of ['a', 'b', 'c', 'd']) {
        act(() => lastInstance().simulateMessage(m));
      }
      expect(result.current.history).toEqual(['b', 'c', 'd']);
      expect(result.current.data).toBe('d');

      act(() => result.current.clearHistory());
      expect(result.current.history).toEqual([]);
    });

    it('skips messages the parser rejects without breaking the stream', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useEventStream<unknown>({ url: '/s', parser: JSON.parse, onMessage })
      );
      act(() => lastInstance().simulateOpen());
      act(() => lastInstance().simulateMessage('not json'));
      act(() => lastInstance().simulateMessage('{"ok":true}'));
      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual({ ok: true });
      expect(result.current.status).toBe('open');
      spy.mockRestore();
    });

    it('does not connect when autoConnect is false until connect() is called', () => {
      const { result } = renderHook(() => useEventStream({ url: '/s', autoConnect: false }));
      expect(MockEventSource.instances).toHaveLength(0);
      expect(result.current.status).toBe('idle');
      act(() => result.current.connect());
      expect(MockEventSource.instances).toHaveLength(1);
    });
  });
});
