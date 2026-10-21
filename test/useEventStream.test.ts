import { describe, it, expect, beforeEach } from 'vitest';
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
});
