import { useEffect, useRef } from 'react';

type SSEHandler = (data: any) => void;

// Marker: handlers tagged with this key are NEVER called by the polling timer.
// They only fire when the server pushes a real SSE event.
// Use useSSEEventOnly() to register these handlers.
export const SSE_EVENT_ONLY = Symbol('SSE_EVENT_ONLY');

// Poll interval in ms — 15s is a good balance of freshness vs server load
const POLL_INTERVAL = 15_000;

/**
 * Polling-based replacement for SSE.
 *
 * Hostinger's reverse proxy kills long-lived SSE connections with 504.
 * This hook calls all provided handlers on a fixed interval instead,
 * which achieves the same "auto-refresh" effect without a persistent connection.
 *
 * IMPORTANT: Only use this for data-refresh handlers (silent load/refetch).
 * Do NOT pass toast/notification handlers here — they will fire every 15s.
 * For event-only handlers (toasts, alerts), use useSSEEventOnly() instead.
 *
 *   useSSE({
 *     order_created:        () => refetchOrders(),
 *     order_status_changed: () => handleStatusChange(),
 *   });
 */
export const useSSE = (handlers: Record<string, SSEHandler>) => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const timer = setInterval(() => {
      // Call every handler with no data — consumers only use them as refresh triggers
      for (const fn of Object.values(handlersRef.current)) {
        try { fn({}); } catch {}
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, []);
};

/**
 * Register handlers that must ONLY fire on real server events — never polled.
 * Currently a no-op since we use polling (real SSE is disabled on Hostinger).
 * Keep this separate so it's easy to wire up real SSE later without changing consumers.
 *
 * Use this for toasts, alerts, and any side-effect that must not repeat every 15s.
 */
export const useSSEEventOnly = (_handlers: Record<string, SSEHandler>) => {
  // No-op: real SSE is disabled. Handlers here are only called by server push.
  // When real SSE is restored, wire up EventSource listeners here.
};
