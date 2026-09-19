/**
 * Public surface of the `diag` domain: the round trip that proves the gateway without Claude.
 *
 * It is a separate domain from `session` on purpose. They shared a name while the walking skeleton
 * was the only thing there was, and keeping that would have meant two different things called
 * `Session` in the same folder — one a counter, the other a live subprocess. D-01 of the
 * live-session plan moved the pair out of the session namespace; this finishes the move.
 */
export { DiagSession } from './entities/diag-session.entity';
export type { DiagSessionSnapshot } from './entities/diag-session.entity';
export { Pong } from './value-objects/pong.value-object';
