import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocketStream } from '../src/hooks/useWebSocketStream';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  protocols?: string | string[];
  readyState = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
  sentMessages: string[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
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

  simulateClose(code = 1000, reason = 'Normal closure') {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  close() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'Client close' }));
  }
}

describe('useWebSocketStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    // @ts-expect-error mock
    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to WebSocket and transitions through status lifecycle', () => {
    const { result } = renderHook(() =>
      useWebSocketStream<{ text: string }>({
        url: 'wss://echo.example.com/ws',
        parser: (raw) => JSON.parse(raw),
      })
    );

    expect(result.current.status).toBe('connecting');
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.url).toBe('wss://echo.example.com/ws');

    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.status).toBe('open');
  });

  it('receives streaming messages and maintains history', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocketStream<{ id: number; msg: string }>({
        url: 'wss://echo.example.com/ws',
        parser: (raw) => JSON.parse(raw),
        onMessage,
      })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage(JSON.stringify({ id: 1, msg: 'hello' }));
    });

    expect(result.current.data).toEqual({ id: 1, msg: 'hello' });
    expect(result.current.history).toHaveLength(1);
    expect(onMessage).toHaveBeenCalledWith({ id: 1, msg: 'hello' }, expect.any(Object));

    act(() => {
      ws.simulateMessage(JSON.stringify({ id: 2, msg: 'world' }));
    });

    expect(result.current.data).toEqual({ id: 2, msg: 'world' });
    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toHaveLength(0);
  });

  it('sends data immediately when open and buffers messages when connecting', () => {
    const { result } = renderHook(() =>
      useWebSocketStream<string, { type: string; payload: string }>({
        url: 'wss://echo.example.com/ws',
        bufferWhileConnecting: true,
      })
    );

    expect(result.current.status).toBe('connecting');

    // Send while connecting -> gets buffered
    act(() => {
      const buffered = result.current.send({ type: 'PING', payload: 'test' });
      expect(buffered).toBe(true);
    });

    expect(result.current.bufferedCount).toBe(1);

    const ws = MockWebSocket.instances[0];
    // Open connection -> buffer is automatically flushed
    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.status).toBe('open');
    expect(result.current.bufferedCount).toBe(0);
    expect(ws.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: 'PING', payload: 'test' });

    // Send while open -> sent immediately
    act(() => {
      result.current.send({ type: 'MESSAGE', payload: 'now' });
    });

    expect(ws.sentMessages).toHaveLength(2);
    expect(JSON.parse(ws.sentMessages[1])).toEqual({ type: 'MESSAGE', payload: 'now' });
  });

  it('reconnects with backoff on unexpected close', () => {
    const { result } = renderHook(() =>
      useWebSocketStream<string>({
        url: 'wss://echo.example.com/ws',
        initialRetryDelayMs: 500,
        maxRetries: 3,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.simulateOpen();
    });
    expect(result.current.status).toBe('open');

    // Simulate unexpected drop
    act(() => {
      ws1.simulateClose(1006, 'Abnormal closure');
    });
    expect(result.current.status).toBe('error');

    // Advance timers for retry backoff
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances.length).toBe(2);
    expect(result.current.status).toBe('connecting');
  });

  it('stops reconnecting when maxRetries is reached', () => {
    const { result } = renderHook(() =>
      useWebSocketStream<string>({
        url: 'wss://echo.example.com/ws',
        initialRetryDelayMs: 200,
        maxRetries: 2,
      })
    );

    // Initial connection drops -> retry 1
    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.simulateClose(1006, 'Drop 1');
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances.length).toBe(2);

    // Retry 1 drops -> retry 2
    const ws2 = MockWebSocket.instances[1];
    act(() => {
      ws2.simulateClose(1006, 'Drop 2');
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances.length).toBe(3);

    // Retry 2 drops -> maxRetries exceeded, give up
    const ws3 = MockWebSocket.instances[2];
    act(() => {
      ws3.simulateClose(1006, 'Drop 3');
    });

    // Should give up after maxRetries and mark status as closed
    expect(result.current.status).toBe('closed');
  });

  it('supports manual disconnect and clean unmount', () => {
    const { result, unmount } = renderHook(() =>
      useWebSocketStream<string>({
        url: 'wss://echo.example.com/ws',
      })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe('closed');
    expect(ws.readyState).toBe(3);

    unmount();
  });

  it('triggers reconnect if heartbeat timeout is exceeded', () => {
    const { result } = renderHook(() =>
      useWebSocketStream<string>({
        url: 'wss://echo.example.com/ws',
        heartbeatTimeoutMs: 5000,
        initialRetryDelayMs: 200,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.simulateOpen();
    });

    // Advance timer beyond heartbeat timeout without any message
    act(() => {
      vi.advanceTimersByTime(5050);
    });

    expect(result.current.status).toBe('error');

    // Backoff timer kicks in to reconnect
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(MockWebSocket.instances.length).toBe(2);
  });
});
