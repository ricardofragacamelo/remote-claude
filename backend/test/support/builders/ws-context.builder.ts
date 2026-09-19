import type { Envelope } from '@remote-claude/contracts';

import type { WsCommandContext } from '@adapter/inbound/ws/ws-command';
import { UserId } from '@domain/auth';
import type { Replay } from '@infra/websocket/event-buffer';
import type { EventDraft } from '@infra/websocket/session-hub';

/** What a test wants to see or to steer, with everything else defaulted. */
export interface WsContextOptions {
  readonly frame: Envelope;
  readonly userId?: UserId;
  readonly connectionId?: string;
  readonly locale?: string;

  /** Locales the handler set on this connection, in order. */
  readonly locales?: string[];

  /** Sessions this connection subscribed to, in order, appended as the handler attaches. */
  readonly attached?: string[];

  /** Sessions this connection unsubscribed from, in order. */
  readonly detached?: string[];

  /** Sessions this connection is taken to be watching. Defaults to whatever it attached to. */
  readonly watching?: readonly string[];

  readonly replay?: (sessionId: string, resumeFromSeq: number | null) => Replay;
  readonly publish?: (sessionId: string, event: EventDraft) => void;
}

/**
 * The context a gateway handler is called with.
 *
 * One builder rather than the same object literal in every handler spec: a member added to
 * `WsCommandContext` would otherwise be a compile error in as many files as there are handlers,
 * and each of them would grow its own slightly different stub.
 */
export function aWsContext(options: WsContextOptions): WsCommandContext {
  const attached = options.attached ?? [];
  const detached = options.detached ?? [];
  const locales = options.locales ?? [];

  return {
    connectionId: options.connectionId ?? 'c1',
    userId: options.userId ?? UserId.create('auth|owner'),
    locale: options.locale ?? 'en',
    setLocale: (locale) => locales.push(locale),
    frame: options.frame,
    attach: (sessionId) => attached.push(sessionId),
    detach: (sessionId) => detached.push(sessionId),
    isAttached: (sessionId) => (options.watching ?? attached).includes(sessionId),
    replay: options.replay ?? (() => ({ events: [], oldestAvailableSeq: 0, gap: false })),
    publish: options.publish ?? (() => undefined),
  };
}
