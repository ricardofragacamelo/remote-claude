import type { UserId } from '@domain/auth';
import type { AuditEventKind } from '../value-objects/audit-event-kind.value-object';

/** What recording one event needs to know. */
export interface AuditEventDraft {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: AuditEventKind;
  /** What the event is about — the device, or the permission rule. */
  readonly subjectId: string;
  /** Recognisable label of the subject, so the trail reads without a second query. */
  readonly subjectLabel: string;
  readonly at: Date;
}

/**
 * One security-relevant fact about an account, for ever.
 *
 * It is `audit_entries`' sibling and not its subtype: that table answers "what ran, with what
 * input, in which session", and none of those columns has an honest value for "this phone was
 * approved". Widening it with nullables would have made every one of its NOT NULLs a lie.
 *
 * Append-only in the same three independent ways: no mutator here, no update on the repository,
 * and a trigger on the table. See docs/architecture/backend/05-persistence.md.
 */
export class AuditEvent {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly kind: AuditEventKind,
    readonly subjectId: string,
    readonly subjectLabel: string,
    readonly at: Date,
  ) {}

  static record(draft: AuditEventDraft): AuditEvent {
    return new AuditEvent(
      draft.id,
      draft.userId,
      draft.kind,
      draft.subjectId,
      draft.subjectLabel,
      draft.at,
    );
  }

  /** Rehydrates an event the repository read back. */
  static restore(draft: AuditEventDraft): AuditEvent {
    return AuditEvent.record(draft);
  }

  snapshot(): AuditEventDraft {
    return {
      id: this.id,
      userId: this.userId,
      kind: this.kind,
      subjectId: this.subjectId,
      subjectLabel: this.subjectLabel,
      at: this.at,
    };
  }
}
