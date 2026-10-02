import { describe, expect, it } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import { payloadOf } from '@adapter/inbound/ws/frame-payload';
import { sessionSchemas } from '@adapter/inbound/ws/session/session-commands';
import { InputValidationError } from '@shared/errors/input-validation.error';

/** A command frame carrying `payload`, as the gateway hands it to a handler. */
function frame(payload: Record<string, unknown>): Envelope {
  return {
    v: 1,
    id: 'f-1',
    kind: 'command',
    type: 'session.prompt',
    ts: '2026-10-01T00:00:00Z',
    payload,
  };
}

/** The fields an invalid payload is refused for, as the client is told them. */
function refusedFields(schema: Parameters<typeof payloadOf>[1], payload: Record<string, unknown>) {
  try {
    payloadOf(frame(payload), schema);
  } catch (error) {
    expect(error).toBeInstanceOf(InputValidationError);
    return (error as InputValidationError).details.map((detail) => detail.field);
  }
  throw new Error('the payload was accepted');
}

const prompt = (attachments: unknown[]) => ({ sessionId: 's-1', text: 'look', attachments });

/**
 * The attachments of a prompt as the backend reads them — plan 08, B-01. The guards generated from
 * the schema say the same; this is the side that answers every invalid field with `INVALID_INPUT`.
 */
describe('the attachments of session.prompt', () => {
  it('accepts every kind, with what it needs — S-01', () => {
    const parsed = payloadOf(
      frame(
        prompt([
          { kind: 'file', path: 'src/a.ts', range: { startLine: 2, endLine: 2 } },
          { kind: 'folder', path: 'src' },
          { kind: 'upload', attachmentId: 'att_1' },
          { kind: 'text', source: 'terminal', label: 'bash', content: '$ ls' },
        ]),
      ),
      sessionSchemas.prompt,
    );

    expect(parsed.attachments).toHaveLength(4);
  });

  it('reads an attachment without a kind as the file it always was — S-02', () => {
    const parsed = payloadOf(frame(prompt([{ path: 'notes.md' }])), sessionSchemas.prompt);

    expect(parsed.attachments).toEqual([{ path: 'notes.md' }]);
  });

  it('accepts the context alone, and refuses a prompt with neither text nor context — S-215', () => {
    expect(
      payloadOf(
        frame({ sessionId: 's', text: '', attachments: [{ path: 'a.ts' }] }),
        sessionSchemas.prompt,
      ),
    ).toMatchObject({ text: '' });
    expect(refusedFields(sessionSchemas.prompt, { sessionId: 's', text: '  ' })).toEqual(['text']);
    expect(
      refusedFields(sessionSchemas.prompt, { sessionId: 's', text: '', attachments: [] }),
    ).toEqual(['text']);
  });

  it('accepts a prompt with no attachments, as before', () => {
    expect(payloadOf(frame({ sessionId: 's', text: 'hi' }), sessionSchemas.prompt)).toEqual({
      sessionId: 's',
      text: 'hi',
    });
  });

  it.each([
    ['a file without a path', { kind: 'file' }],
    ['an upload without its id', { kind: 'upload' }],
    ['text without content', { kind: 'text', source: 'terminal', label: 'bash' }],
    [
      'text from a provider nobody registered',
      { kind: 'text', source: 'clipboard', label: 'x', content: 'y' },
    ],
  ])('refuses %s — S-03', (_case, item) => {
    expect(refusedFields(sessionSchemas.prompt, prompt([item]))).not.toEqual([]);
  });

  it.each([
    ['a start at line 0', { startLine: 0, endLine: 3 }, 'attachments.0.range.startLine'],
    ['a negative end', { startLine: 1, endLine: -1 }, 'attachments.0.range.endLine'],
    ['an end before the start', { startLine: 9, endLine: 3 }, 'attachments.0.range.endLine'],
  ])('refuses %s — S-04', (_case, lines, field) => {
    expect(
      refusedFields(sessionSchemas.prompt, prompt([{ path: 'a.ts', range: lines }])),
    ).toContain(field);
  });

  it('takes exactly the most attachments the schema allows, and refuses one more — S-05', () => {
    const one = { kind: 'file', path: 'a.ts' };

    expect(
      payloadOf(frame(prompt(Array.from({ length: 20 }, () => one))), sessionSchemas.prompt)
        .attachments,
    ).toHaveLength(20);
    expect(
      refusedFields(sessionSchemas.prompt, prompt(Array.from({ length: 21 }, () => one))),
    ).toEqual(['attachments']);
  });

  it('refuses text from a provider above the ceiling of the schema — S-06', () => {
    const text = (length: number) => ({
      kind: 'text',
      source: 'terminal',
      label: 'bash',
      content: 'x'.repeat(length),
    });

    expect(
      payloadOf(frame(prompt([text(16_384)])), sessionSchemas.prompt).attachments,
    ).toHaveLength(1);
    expect(refusedFields(sessionSchemas.prompt, prompt([text(16_385)]))).not.toEqual([]);
  });
});

describe('the fork point of session.start — S-08', () => {
  it('refuses a fork point without the conversation it belongs to', () => {
    expect(refusedFields(sessionSchemas.start, { workspacePath: '/w', forkAt: 'm-1' })).toEqual([
      'resumeSessionId',
    ]);
  });

  it('accepts a fork point of a resumed conversation, and a start with neither', () => {
    expect(
      payloadOf(
        frame({ workspacePath: '/w', forkAt: 'm-1', resumeSessionId: 'c-1' }),
        sessionSchemas.start,
      ),
    ).toMatchObject({ forkAt: 'm-1', resumeSessionId: 'c-1' });
    expect(payloadOf(frame({ workspacePath: '/w' }), sessionSchemas.start)).toEqual({
      workspacePath: '/w',
    });
  });
});
