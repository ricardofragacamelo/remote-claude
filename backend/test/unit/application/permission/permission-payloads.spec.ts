import { describe, expect, it } from 'vitest';

import { isPermissionRequestedPayload } from '@remote-claude/contracts';

import { normalizeQuestion } from '@adapter/outbound/engines/claude/question-input';
import { PermissionRequest } from '@domain/permission';
import type { PermissionResolution } from '@domain/permission';
import { requestedPayload, resolvedPayload } from '@application/permission/permission-payloads';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
} from '../../../support/builders/permission.builder';
import { claudeTool } from '../../../support/builders/tool.builder';

/** A rule answered: automatic, no origin, no author. */
const byRule: PermissionResolution = {
  decision: 'allow',
  reason: null,
  scope: 'always',
  resolvedBy: null,
  resolvedFrom: null,
  auto: true,
  at: new Date('2026-10-04T12:00:00.000Z'),
};

describe('resolvedPayload — the settlement as `permission.resolved` carries it', () => {
  it('names the tool the request was about, so its line can say how it ended (plan 10, B-20)', () => {
    expect(resolvedPayload({ id: 'request-1', toolUseId: 'toolu-1' }, byRule)).toEqual({
      requestId: 'request-1',
      decision: 'allow',
      auto: true,
      toolUseId: 'toolu-1',
    });
  });

  it('leaves the tool out, rather than null or empty, when the SDK named none', () => {
    expect(resolvedPayload({ id: 'request-1', toolUseId: null }, byRule)).not.toHaveProperty(
      'toolUseId',
    );
    expect(resolvedPayload({ id: 'request-1', toolUseId: '' }, byRule)).not.toHaveProperty(
      'toolUseId',
    );
  });
});

/** A request of [toolName] with [input], opened as the use case opens one. */
function requestOf(
  toolName: string,
  input: Record<string, unknown>,
  options: { readonly question?: boolean; readonly toolUseId?: string | null } = {},
): PermissionRequest {
  return PermissionRequest.open({
    id: 'request-1',
    sessionId: PERMISSION_SESSION,
    userId: PERMISSION_OWNER,
    projectPath: '/srv/projects/app',
    toolUseId: options.toolUseId === undefined ? 'toolu-1' : options.toolUseId,
    toolName,
    input,
    tool: claudeTool(toolName, input, '/srv/projects/app'),
    ...(options.question === true ? { interaction: normalizeQuestion(input) } : {}),
    riskHint: 'write',
    requestedAt: PERMISSION_NOW,
    expiresAt: new Date(PERMISSION_NOW.getTime() + 1_000),
  });
}

describe('requestedPayload — the request as `permission.requested` carries it (plan 28, B-15)', () => {
  const EDIT = { file_path: '/srv/projects/app/a.ts', old_string: 'a', new_string: 'b' };

  it('names the call by its canonical fields, and titles it by its kind — S-46', () => {
    const payload = requestedPayload(requestOf('Edit', EDIT), 60_000);

    expect(payload).toMatchObject({
      requestId: 'request-1',
      toolUseId: 'toolu-1',
      kind: 'file.edit',
      label: {
        messageKey: 'sessions.tool.fileEdit',
        params: { path: 'a.ts', added: 1, removed: 1 },
      },
      subject: { paths: ['/srv/projects/app/a.ts'] },
      // The change without its replacements: the preview comes from the diff route (D-28).
      changes: [{ path: '/srv/projects/app/a.ts', op: 'edit' }],
      origin: { engine: 'claude', native: 'Edit' },
      rawInput: EDIT,
      title: 'permission.tool.fileEdit',
      riskHint: 'write',
      defaultToNo: true,
    });
    expect(payload).not.toHaveProperty('toolName');
    expect(payload).not.toHaveProperty('input');
    expect(isPermissionRequestedPayload(payload)).toBe(true);
  });

  it.each([
    ['Bash', { command: 'ls' }, 'permission.tool.shell'],
    ['BashOutput', {}, 'permission.tool.shellOutput'],
    ['WebFetch', { url: 'https://example.com' }, 'permission.tool.webFetch'],
    ['mcp__srv__x', {}, 'permission.tool.mcp'],
    ['SomethingNew', {}, 'permission.tool.other'],
  ])('titles %s by the key of its kind', (toolName, input, title) => {
    const payload = requestedPayload(requestOf(toolName, input), 60_000);

    expect(payload['title']).toBe(title);
    expect(isPermissionRequestedPayload(payload)).toBe(true);
  });

  it('titles a question by its kind, and carries its interaction — S-46', () => {
    const input = { questions: [{ question: 'Which?', header: 'Pick', options: [] }] };
    const payload = requestedPayload(requestOf('AskUserQuestion', input, { question: true }), 0);

    expect(payload).toMatchObject({
      kind: 'question',
      title: 'permission.tool.question',
      rawInput: input,
      defaultToNo: false,
      suggestions: [],
      reaches: [],
      interaction: { kind: 'question' },
    });
    expect(isPermissionRequestedPayload(payload)).toBe(true);
  });

  it('carries a plan: its markdown and file, refusal first, nothing to authorise — S-61', () => {
    const input = { plan: '# Plan\n\n1. Edit a.ts', planFilePath: '/srv/projects/app/plan.md' };
    const tool = claudeTool('ExitPlanMode', input);
    const request = PermissionRequest.open({
      id: 'request-1',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: '/srv/projects/app',
      toolUseId: 'toolu-1',
      toolName: 'ExitPlanMode',
      input,
      tool,
      interaction: tool.interaction ?? null,
      riskHint: 'read',
      requestedAt: PERMISSION_NOW,
      expiresAt: new Date(PERMISSION_NOW.getTime() + 1_000),
    });

    const payload = requestedPayload(request, 60_000);

    expect(payload).toMatchObject({
      kind: 'plan',
      title: 'permission.tool.plan',
      defaultToNo: true,
      suggestions: [],
      reaches: [],
      interaction: {
        kind: 'plan',
        markdown: '# Plan\n\n1. Edit a.ts',
        path: '/srv/projects/app/plan.md',
      },
    });
    expect(payload).not.toHaveProperty('description');
    expect(isPermissionRequestedPayload(payload)).toBe(true);
  });

  it('says there was no call id with an empty one, which the guard still accepts', () => {
    const payload = requestedPayload(requestOf('Bash', { command: 'ls' }, { toolUseId: null }), 0);

    expect(payload['toolUseId']).toBe('');
    expect(isPermissionRequestedPayload(payload)).toBe(true);
  });
});

/** The detail and the rules a card offers, read from the canonical call (plan 28, B-31). */
describe('requestedPayload — in the canonical grammar', () => {
  it.each([
    ['Bash', { command: 'git status' }, 'git status'],
    ['Edit', { file_path: '/srv/projects/app/a.ts' }, '/srv/projects/app/a.ts'],
    ['Grep', { pattern: 'TODO', path: '/srv/projects/app/src' }, '/srv/projects/app/src'],
    ['Glob', { pattern: '**/*.ts' }, '**/*.ts'],
    ['WebFetch', { url: 'https://example.com/a' }, 'https://example.com/a'],
  ])('describes %s by its subject — %j', (toolName, input, description) => {
    expect(requestedPayload(requestOf(toolName, input), 0)['description']).toBe(description);
  });

  it.each([
    ['WebSearch', { query: 'vitest' }],
    ['mcp__srv__x', { anything: 1 }],
    ['Bash', { command: '' }],
  ])('describes %s by nothing, when its subject says nothing a card shows', (toolName, input) => {
    expect(requestedPayload(requestOf(toolName, input), 0)).not.toHaveProperty('description');
  });

  it('offers canonical patterns, relative to the folder — S-92', () => {
    const payload = requestedPayload(
      requestOf('Edit', { file_path: '/srv/projects/app/src/a.ts' }),
      60_000,
    );

    expect(payload['reaches']).toEqual([
      { reach: 'exact', patterns: ['file.edit(src/a.ts)'] },
      { reach: 'tool', patterns: ['file.edit'] },
    ]);
    expect(payload['suggestions']).toContainEqual(
      expect.objectContaining({ scope: 'always', pattern: 'file.edit(src/a.ts)' }),
    );
  });
});
