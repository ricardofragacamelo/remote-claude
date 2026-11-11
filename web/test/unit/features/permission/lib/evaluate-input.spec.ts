import { describe, expect, it } from 'vitest';

import { evaluationInputOf } from '@/features/permission/lib/evaluate-input';
import type { CommandTestDraft } from '@/features/permission/lib/evaluate-input';

const BASE: CommandTestDraft = { kind: 'shell', value: 'git status' };

describe('evaluationInputOf — assembling a command-test request (plan 15, B-28, S-196)', () => {
  it('is null while no kind has been chosen yet', () => {
    expect(evaluationInputOf({ kind: null, value: '' })).toBeNull();
  });

  it('is null for a kind that needs a subject, while the value is still blank', () => {
    expect(evaluationInputOf({ kind: 'shell', value: '' })).toBeNull();
    expect(evaluationInputOf({ kind: 'shell', value: '   ' })).toBeNull();
  });

  it('builds the input once a kind needing no subject is chosen, even with no value', () => {
    expect(evaluationInputOf({ kind: 'search', value: '' })).toEqual({
      kind: 'search',
      subject: {},
    });
  });

  it('builds the input once the subject is filled in', () => {
    expect(evaluationInputOf(BASE)).toEqual({
      kind: 'shell',
      subject: { command: 'git status' },
    });
  });

  it('carries the folder along, when one was chosen', () => {
    expect(evaluationInputOf({ ...BASE, folder: '/srv/app' })).toEqual({
      kind: 'shell',
      subject: { command: 'git status' },
      folder: '/srv/app',
    });
  });

  it('leaves `folder` out entirely when none was chosen', () => {
    const input = evaluationInputOf(BASE);
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty('folder');
  });

  it('carries the mode along, when one was picked', () => {
    expect(evaluationInputOf({ ...BASE, mode: 'readOnly' })).toEqual({
      kind: 'shell',
      subject: { command: 'git status' },
      mode: 'readOnly',
    });
  });

  it('leaves `mode` out entirely when none was picked', () => {
    const input = evaluationInputOf(BASE);
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty('mode');
  });

  it('carries the wizard’s own draft rule along, when testing from inside the review step (S-198)', () => {
    const draft = { pattern: 'shell(git status)', decision: 'allow' } as const;
    expect(evaluationInputOf({ ...BASE, draft })).toEqual({
      kind: 'shell',
      subject: { command: 'git status' },
      draft,
    });
  });

  it('leaves `draft` out entirely for the standalone panel, which never has one', () => {
    const input = evaluationInputOf(BASE);
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty('draft');
  });
});
