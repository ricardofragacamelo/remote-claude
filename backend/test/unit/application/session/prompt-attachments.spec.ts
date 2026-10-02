import { describe, expect, it } from 'vitest';

import { AttachmentStore, UploadAttachmentUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import {
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  SessionNotFoundError,
} from '@domain/session';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { aRegistry, aSession, SESSION_ID } from '../../../support/builders/session.builder';

const OTHER = '01J0ABCDEFGHJKMNPQRSTVWXY0';
const owner = UserId.create('auth|owner');
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function aStore(clock = new FixedClock(new Date('2026-10-02T12:00:00.000Z')), memoryBytes = 1_000) {
  return { clock, store: new AttachmentStore(clock, { ttlMs: 60_000, memoryBytes }) };
}

const upload = (name: string, bytes: Uint8Array) => ({
  kind: 'text' as const,
  mediaType: 'text/plain',
  name,
  size: bytes.length,
  sha256: name,
  bytes,
});

describe('AttachmentStore — plan 08, B-45', () => {
  it('answers the same attachment for the same bytes of the same session — S-213', () => {
    const { store } = aStore();

    const first = store.keep(SESSION_ID, upload('a', text('aa')), 'att_1');
    const again = store.keep(SESSION_ID, upload('a', text('aa')), 'att_2');

    expect(again.attachmentId).toBe(first.attachmentId);
    expect(store.heldBytes).toBe(2);
  });

  it('keeps the same bytes apart for two sessions', () => {
    const { store } = aStore();

    store.keep(SESSION_ID, upload('a', text('aa')), 'att_1');
    const other = store.keep(OTHER, upload('a', text('aa')), 'att_2');

    expect(other.attachmentId).toBe('att_2');
  });

  it('refuses an attachment of another session, unknown or expired alike — S-210', () => {
    const { store, clock } = aStore();
    store.keep(SESSION_ID, upload('a', text('aa')), 'att_1');

    expect(() => store.take(OTHER, 'att_1')).toThrow(AttachmentNotFoundError);
    expect(() => store.take(SESSION_ID, 'att_9')).toThrow(AttachmentNotFoundError);

    clock.advance(60_000);
    expect(() => store.take(SESSION_ID, 'att_1')).toThrow(AttachmentNotFoundError);
    expect(store.heldBytes).toBe(0);
  });

  it('holds one until a moment before its time runs out — S-212', () => {
    const { store, clock } = aStore();
    store.keep(SESSION_ID, upload('a', text('aa')), 'att_1');

    clock.advance(59_999);

    expect(store.take(SESSION_ID, 'att_1').name).toBe('a');
  });

  it('lets go of what a session held when it ends — S-212', () => {
    const { store } = aStore();
    store.keep(SESSION_ID, upload('a', text('aa')), 'att_1');
    store.keep(OTHER, upload('b', text('bb')), 'att_2');

    store.discardSession(SESSION_ID);

    expect(() => store.take(SESSION_ID, 'att_1')).toThrow(AttachmentNotFoundError);
    expect(store.take(OTHER, 'att_2').name).toBe('b');
  });

  it('lets the oldest go when all of them would pass the memory they may hold', () => {
    const { store } = aStore(undefined, 5);
    store.keep(SESSION_ID, upload('a', text('aaa')), 'att_1');
    store.keep(SESSION_ID, upload('b', text('bbb')), 'att_2');

    expect(() => store.take(SESSION_ID, 'att_1')).toThrow(AttachmentNotFoundError);
    expect(store.take(SESSION_ID, 'att_2').name).toBe('b');
    expect(store.heldBytes).toBe(3);
  });
});

describe('UploadAttachmentUseCase — plan 08, B-45', () => {
  function uploader(maxBytes = 8) {
    const { registry } = aRegistry([aSession()]);
    const { store } = aStore();
    return new UploadAttachmentUseCase(registry, store, new SequentialIds(), { maxBytes });
  }

  it('takes text exactly at the ceiling, and names it by its last segment — S-208', () => {
    const held = uploader().execute(
      {
        sessionId: SESSION_ID,
        name: 'C:\\Users\\me\\notes.txt',
        bytes: text('12345678'),
        truncated: false,
      },
      owner,
    );

    expect(held.attachment).toMatchObject({
      kind: 'text',
      mediaType: 'text/plain',
      name: 'notes.txt',
      size: 8,
    });
    expect(held.attachment.attachmentId).toMatch(/^att_/);
    expect(held.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('names a nameless file `attachment`', () => {
    expect(
      uploader().execute(
        { sessionId: SESSION_ID, name: '  ', bytes: text('a'), truncated: false },
        owner,
      ).attachment.name,
    ).toBe('attachment');
  });

  it.each([
    ['one byte past the ceiling', text('123456789'), false],
    ['a body the parser cut', text('1234'), true],
  ])('refuses %s — S-208', (_case, bytes, truncated) => {
    expect(() =>
      uploader().execute({ sessionId: SESSION_ID, name: 'a', bytes, truncated }, owner),
    ).toThrow(AttachmentTooLargeError);
  });

  it('refuses a type the prompt does not carry — S-209', () => {
    expect(() =>
      uploader().execute(
        {
          sessionId: SESSION_ID,
          name: 'a.bin',
          bytes: Uint8Array.from([1, 0, 2]),
          truncated: false,
        },
        owner,
      ),
    ).toThrow(AttachmentTypeUnsupportedError);
  });

  it("refuses somebody else's session", () => {
    expect(() =>
      uploader().execute(
        { sessionId: SESSION_ID, name: 'a', bytes: text('a'), truncated: false },
        UserId.create('auth|stranger'),
      ),
    ).toThrow();
  });

  it('refuses a session that is not live', () => {
    expect(() =>
      uploader().execute(
        { sessionId: OTHER, name: 'a', bytes: text('a'), truncated: false },
        owner,
      ),
    ).toThrow(SessionNotFoundError);
  });
});
