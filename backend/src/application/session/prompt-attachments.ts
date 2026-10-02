import { createHash } from 'node:crypto';

import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import {
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  attachmentKindOf,
  SessionId,
} from '@domain/session';
import type { SessionRegistry } from './session-registry';

/** How far the attachments of the prompts may go. */
export interface AttachmentLimits {
  /** The largest one, in bytes — 5 MB by D-02. */
  readonly maxBytes: number;

  /** How long one is held, from its upload, if its session does not end first. */
  readonly ttlMs: number;

  /** What all of them together may hold in memory; past it, the oldest go first. */
  readonly memoryBytes: number;
}

/** An attachment, as the session holds it until a prompt carries it. */
export interface HeldAttachment {
  readonly attachmentId: string;
  readonly kind: 'image' | 'text';
  readonly mediaType: string;

  /** The name the person's file had — what a text is introduced to Claude by. */
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

/** What the client is told of an attachment: what it is, never its bytes nor its hash. */
export type AttachmentView = Pick<
  HeldAttachment,
  'attachmentId' | 'kind' | 'mediaType' | 'name' | 'size'
>;

/** What an upload answered: the view the client gets, and the hash the log may carry. */
export interface UploadedAttachment {
  readonly attachment: AttachmentView;
  readonly sha256: string;
}

interface Entry {
  readonly sessionId: string;
  readonly attachment: HeldAttachment;
  readonly expiresAt: number;
}

/**
 * The attachments of the prompts — images and text files dropped from the desktop — plan 08, B-45.
 *
 * In memory and nowhere else: never in the folder, the trail or the log (D-02, D-22). One belongs to
 * one session, goes when it ends (S-212) or when its time runs out, and the oldest give way when
 * all of them together would pass the memory they may use. The same bytes uploaded again to the
 * same session — a retry — are the attachment they already were (S-213).
 */
export class AttachmentStore {
  private readonly entries = new Map<string, Entry>();
  private held = 0;

  constructor(
    private readonly clock: Clock,
    private readonly limits: Pick<AttachmentLimits, 'ttlMs' | 'memoryBytes'>,
  ) {}

  /** Keeps an attachment for a session — or answers the one it already holds with these bytes. */
  keep(
    sessionId: string,
    upload: Omit<HeldAttachment, 'attachmentId'>,
    id: string,
  ): HeldAttachment {
    this.sweep();

    const same = [...this.entries.values()].find(
      (entry) => entry.sessionId === sessionId && entry.attachment.sha256 === upload.sha256,
    );
    if (same !== undefined) {
      return same.attachment;
    }

    const attachment = { ...upload, attachmentId: id };
    this.entries.set(id, {
      sessionId,
      attachment,
      expiresAt: this.clock.now().getTime() + this.limits.ttlMs,
    });
    this.held += attachment.size;
    this.makeRoom();

    return attachment;
  }

  /**
   * @throws {AttachmentNotFoundError} never held, held for another session, or gone — the three
   *   alike, so an id says nothing about the attachments of anybody else (S-210)
   */
  take(sessionId: string, attachmentId: string): HeldAttachment {
    this.sweep();

    const entry = this.entries.get(attachmentId);
    if (entry?.sessionId !== sessionId) {
      throw new AttachmentNotFoundError(attachmentId);
    }

    return entry.attachment;
  }

  /** The session ended: what it held goes with it. */
  discardSession(sessionId: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.sessionId === sessionId) {
        this.drop(id, entry);
      }
    }
  }

  /** How many bytes are held, all sessions together. */
  get heldBytes(): number {
    return this.held;
  }

  private sweep(): void {
    const now = this.clock.now().getTime();

    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.drop(id, entry);
      }
    }
  }

  /** The oldest go first — the map keeps the order they came in. */
  private makeRoom(): void {
    for (const [id, entry] of this.entries) {
      if (this.held <= this.limits.memoryBytes) {
        return;
      }
      this.drop(id, entry);
    }
  }

  private drop(id: string, entry: Entry): void {
    this.entries.delete(id);
    this.held -= entry.attachment.size;
  }
}

/** One file dropped from the desktop, as it arrived. */
export interface AttachmentUpload {
  readonly sessionId: string;
  readonly name: string;
  readonly bytes: Uint8Array;

  /** More bytes arrived than the ceiling: the body was cut, and nothing of it is kept. */
  readonly truncated: boolean;
}

/**
 * Takes an attachment for a session (B-45): the owner's live session, under the ceiling, of a type
 * the prompt carries — by its bytes. What it answers is an id the prompt names; the bytes stay here.
 */
export class UploadAttachmentUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly store: AttachmentStore,
    private readonly ids: IdGenerator,
    private readonly limits: Pick<AttachmentLimits, 'maxBytes'>,
  ) {}

  /**
   * @throws {import('@domain/session').InvalidSessionIdError} an id that is not a session's
   * @throws {import('@domain/session').SessionNotFoundError} unknown, closed, or somebody else's
   * @throws {AttachmentTooLargeError} past the ceiling — one byte is enough (S-208)
   * @throws {AttachmentTypeUnsupportedError} not one of the four images, nor UTF-8 text (S-209)
   */
  execute(upload: AttachmentUpload, userId: UserId): UploadedAttachment {
    const live = this.registry.require(SessionId.create(upload.sessionId), userId);

    if (upload.truncated || upload.bytes.length > this.limits.maxBytes) {
      throw new AttachmentTooLargeError(this.limits.maxBytes);
    }

    const sniffed = attachmentKindOf(upload.bytes);
    if (sniffed.kind === 'unsupported') {
      throw new AttachmentTypeUnsupportedError(sniffed.mediaType);
    }

    const held = this.store.keep(
      live.session.id.value,
      {
        kind: sniffed.kind,
        mediaType: sniffed.mediaType,
        name: nameOf(upload.name),
        size: upload.bytes.length,
        sha256: createHash('sha256').update(upload.bytes).digest('hex'),
        bytes: upload.bytes,
      },
      `att_${this.ids.next()}`,
    );

    const { attachmentId, kind, mediaType, name, size } = held;

    return { attachment: { attachmentId, kind, mediaType, name, size }, sha256: held.sha256 };
  }
}

/** The longest name kept: what a label of the context may be (`label.maxLength` of the schema). */
const MAX_NAME_LENGTH = 200;

/** The last segment of what the browser called the file, bounded — a name, never a path. */
function nameOf(raw: string): string {
  const name = raw.split(/[\\/]/).pop()?.trim() ?? '';

  return (name === '' ? 'attachment' : name).slice(0, MAX_NAME_LENGTH);
}
