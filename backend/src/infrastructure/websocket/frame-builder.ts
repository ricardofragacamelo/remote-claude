import { PROTOCOL_VERSION } from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import type { Clock, IdGenerator } from '@domain/shared';
import { toErrorEnvelope } from '@shared/errors/error-catalogue';

/** Everything that varies between one outgoing frame and the next. */
export interface FrameDraft {
  readonly kind: Envelope['kind'];
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly sessionId?: string;
  readonly seq?: number;
}

/**
 * Builds outgoing frames.
 *
 * One place stamps `v`, `id` and `ts`, so no handler can forget one — and `seq` arrives already
 * decided, because the hub is the only thing allowed to assign it.
 */
export class FrameBuilder {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  build(draft: FrameDraft): Envelope {
    return {
      v: PROTOCOL_VERSION,
      id: this.ids.next(),
      kind: draft.kind,
      type: draft.type,
      ts: this.clock.now().toISOString(),
      ...(draft.traceId === undefined ? {} : { traceId: draft.traceId }),
      ...(draft.correlationId === undefined ? {} : { correlationId: draft.correlationId }),
      ...(draft.sessionId === undefined ? {} : { sessionId: draft.sessionId }),
      ...(draft.seq === undefined ? {} : { seq: draft.seq }),
      payload: draft.payload,
    };
  }

  /** An error frame. It answers a command; it never closes the socket by itself. */
  error(error: unknown, traceId: string, correlationId?: string): Envelope {
    const envelope = toErrorEnvelope(error, traceId);

    return this.build({
      kind: 'error',
      type: 'error',
      payload: envelope.error,
      traceId,
      ...(correlationId === undefined ? {} : { correlationId }),
    });
  }
}
