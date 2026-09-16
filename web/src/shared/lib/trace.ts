/**
 * Where a trace is born.
 *
 * At the click, in the browser — not at the backend. It travels in `x-trace-id` over HTTP and in
 * the `traceId` field of a WebSocket frame, and it is what ties what the user saw to what the
 * server did. See docs/architecture/shared/03-logging.md#traceid--como-propaga.
 */
export function newTraceId(): string {
  return crypto.randomUUID();
}
