import type { Envelope } from '@remote-claude/contracts';

import type { ConnectionStatus } from './ws-client';

/**
 * The part of the socket client a subscription needs — the folder watches and the followed
 * transcripts are both built on it, and a test hands them a fake of it.
 */
export interface SubscriptionTransport {
  issue(type: string, payload: Readonly<Record<string, unknown>>): string | null;
  command(type: string, payload: Readonly<Record<string, unknown>>): boolean;
  observe(listener: (frame: Envelope) => void): () => void;
  onStatus(watcher: (status: ConnectionStatus) => void): () => void;
}

/**
 * Hands each frame of a subscription to its handler, by type, and an error that answers a command
 * (it carries a `correlationId`) to `refused`. Every other frame belongs to somebody else.
 */
export function routeFrames(
  transport: SubscriptionTransport,
  handlers: Readonly<Record<string, (frame: Envelope) => void>>,
  refused: (frame: Envelope) => void,
): void {
  transport.observe((frame) => {
    const handler = handlers[frame.type];

    if (handler !== undefined) {
      handler(frame);
    } else if (frame.kind === 'error' && frame.correlationId !== undefined) {
      refused(frame);
    }
  });
}

/**
 * Calls `changed` each time the socket becomes ready, or stops being ready — once per change, never
 * for a status that leaves readiness where it was. It starts not ready.
 */
export function watchReadiness(
  transport: SubscriptionTransport,
  changed: (ready: boolean) => void,
): void {
  let ready = false;

  transport.onStatus((status) => {
    const nowReady = status === 'ready';

    if (nowReady !== ready) {
      ready = nowReady;
      changed(ready);
    }
  });
}
