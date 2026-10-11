import { describe, expect, it } from 'vitest';

import { ToolClassifiers } from '@application/engine';
import type { ToolClassify } from '@application/engine';
import { classifyTool } from '@adapter/outbound/engines/claude/tool-classifier';

/** A classifier of a second engine, which says what it was asked. */
const otherEngine: ToolClassify = (native, rawInput, folder) => ({
  kind: 'shell',
  label: { messageKey: 'sessions.tool.shell', params: { command: String(rawInput['cmd']) } },
  subject: { command: String(rawInput['cmd']), description: folder },
  changes: [],
  origin: { engine: 'test-engine', native },
});

const classifiers = new ToolClassifiers(
  [
    { engine: 'claude', classify: classifyTool },
    { engine: 'test-engine', classify: otherEngine },
  ],
  'claude',
);

/** Where the core reads a call kept in the engine's own words — plan 28, D-31 / S-52. */
describe('ToolClassifiers', () => {
  it('reads a call by the classifier of the engine it names', () => {
    const tool = classifiers.classify('test-engine', 'run', { cmd: 'ls' }, '/srv/app');

    expect(tool).toMatchObject({
      kind: 'shell',
      subject: { command: 'ls', description: '/srv/app' },
      origin: { engine: 'test-engine', native: 'run' },
    });
  });

  it('reads a record that names no engine by the default engine`s classifier', () => {
    const tool = classifiers.classify(null, 'Read', { file_path: '/srv/app/a.ts' });

    expect(tool).toEqual(classifyTool('Read', { file_path: '/srv/app/a.ts' }, ''));
    expect(tool.kind).toBe('file.read');
  });

  it('passes the folder on, which the label`s paths are relative to', () => {
    const tool = classifiers.classify('claude', 'Read', { file_path: '/srv/app/a.ts' }, '/srv/app');

    expect(tool.label).toEqual({ messageKey: 'sessions.tool.fileRead', params: { path: 'a.ts' } });
  });

  it('gives an engine with no classifier the generic line, by the name the record kept', () => {
    // It asks, and the trail discloses it whole: nothing is guessed about a call nobody can read.
    expect(classifiers.classify('gone-engine', 'Read', { file_path: '/a' })).toEqual({
      kind: 'other',
      label: { messageKey: 'sessions.tool.other', params: { name: 'Read' } },
      subject: {},
      changes: [],
      origin: { engine: 'gone-engine', native: 'Read' },
    });
  });

  it('gives the generic line of the default engine when even the default has no classifier', () => {
    const none = new ToolClassifiers([], 'claude');

    expect(none.classify(null, 'Bash', { command: 'ls' })).toMatchObject({
      kind: 'other',
      origin: { engine: 'claude', native: 'Bash' },
    });
  });
});
