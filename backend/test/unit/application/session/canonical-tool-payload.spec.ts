import { describe, expect, it } from 'vitest';

import { canonicalToolPayload, interactionPayload } from '@application/session';
import { isToolStartedPayload } from '@remote-claude/contracts';
import type { CanonicalTool } from '@domain/engine';
import { claudeTool } from '../../../support/builders/tool.builder';

/** The fields a canonical tool travels with — plan 28, B-15 / S-46. */
describe('canonicalToolPayload', () => {
  it('carries the kind, the label, the subject, the origin and the raw input', () => {
    const input = { file_path: '/srv/app/a.ts', offset: 2 };

    expect(canonicalToolPayload(claudeTool('Read', input, '/srv/app'), input)).toEqual({
      kind: 'file.read',
      label: { messageKey: 'sessions.tool.fileRead', params: { path: 'a.ts' } },
      subject: { paths: ['/srv/app/a.ts'], window: { offset: 2 } },
      changes: [],
      origin: { engine: 'claude', native: 'Read' },
      rawInput: input,
    });
  });

  it('sends a change without its text: the diff comes from the route (D-28)', () => {
    const edit = { file_path: '/srv/app/a.ts', old_string: 'SECRET', new_string: 'b' };
    const write = { file_path: '/srv/app/b.ts', content: 'SECRET' };

    expect(canonicalToolPayload(claudeTool('Edit', edit), edit).changes).toEqual([
      { path: '/srv/app/a.ts', op: 'edit' },
    ]);
    expect(canonicalToolPayload(claudeTool('Write', write), write).changes).toEqual([
      { path: '/srv/app/b.ts', op: 'write' },
    ]);
    // The text is in the raw input, and only there.
    expect(JSON.stringify(canonicalToolPayload(claudeTool('Edit', edit), {}))).not.toContain(
      'SECRET',
    );
  });

  it('keeps where a move goes, and nothing it does not have', () => {
    const tool: CanonicalTool = {
      kind: 'file.move',
      label: { messageKey: 'sessions.tool.other', params: { name: 'mv' } },
      subject: {},
      changes: [
        { path: '/a', op: 'move', to: '/b' },
        { path: '/c', op: 'delete' },
      ],
      origin: { engine: 'test-engine', native: 'mv' },
    };

    expect(canonicalToolPayload(tool, {}).changes).toEqual([
      { path: '/a', op: 'move', to: '/b' },
      { path: '/c', op: 'delete' },
    ]);
  });

  it('copies the label`s params, so the payload cannot change the tool it came from', () => {
    const tool = claudeTool('Bash', { command: 'ls' });
    const payload = canonicalToolPayload(tool, { command: 'ls' });

    (payload.label.params as Record<string, unknown>)['command'] = 'rm -rf /';
    (payload.origin as { native: string }).native = 'Other';

    expect(tool.label.params).toEqual({ command: 'ls' });
    expect(tool.origin.native).toBe('Bash');
  });

  it('carries the plan a call presents, so the history draws it without the raw input — S-61', () => {
    const input = { plan: '# Plan', planFilePath: '/srv/app/plan.md' };
    const payload = canonicalToolPayload(claudeTool('ExitPlanMode', input), input);

    expect(payload).toMatchObject({
      kind: 'plan',
      interaction: { kind: 'plan', markdown: '# Plan', path: '/srv/app/plan.md' },
    });
    expect(isToolStartedPayload({ toolUseId: 't-1', ...payload })).toBe(true);
  });

  it('carries the question a call asks, and no interaction on a call that asks nothing — S-64', () => {
    const input = {
      questions: [
        { question: 'Which?', header: 'Pick', options: [{ label: 'A' }, { label: 'B' }] },
      ],
    };

    expect(
      canonicalToolPayload(claudeTool('AskUserQuestion', input), input).interaction,
    ).toMatchObject({
      kind: 'question',
      malformed: false,
      questions: [{ id: 'q1', prompt: 'Which?' }],
    });
    expect(canonicalToolPayload(claudeTool('Bash', { command: 'ls' }), {})).not.toHaveProperty(
      'interaction',
    );
  });
});

describe('interactionPayload — plan 24; plan 28, B-20', () => {
  it('leaves a plan`s path out, rather than null, when the agent saved it nowhere', () => {
    expect(interactionPayload({ kind: 'plan', markdown: '# Plan', path: null })).toEqual({
      kind: 'plan',
      markdown: '# Plan',
    });
    expect(interactionPayload({ kind: 'plan', markdown: '', path: '/p.md' })).toEqual({
      kind: 'plan',
      markdown: '',
      path: '/p.md',
    });
  });

  it('publishes what a screen shows of a question, never what the agent wrote before a cut', () => {
    expect(
      interactionPayload({
        kind: 'question',
        malformed: false,
        questions: [
          {
            id: 'q1',
            header: 'H',
            prompt: 'Short…',
            originalPrompt: 'Short and long',
            multiSelect: true,
            options: [
              { label: 'A', description: 'a', preview: '`x`', originalLabel: 'A' },
              { label: 'B…', description: '', preview: null, originalLabel: 'Big' },
            ],
          },
        ],
      }),
    ).toEqual({
      kind: 'question',
      malformed: false,
      questions: [
        {
          id: 'q1',
          header: 'H',
          prompt: 'Short…',
          multiSelect: true,
          options: [
            { label: 'A', description: 'a', preview: '`x`' },
            { label: 'B…', description: '' },
          ],
        },
      ],
    });
  });
});
