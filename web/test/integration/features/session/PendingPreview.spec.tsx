import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { axe } from 'jest-axe';

import type { PermissionRequest } from '@/features/permission';
import { InlinePermission } from '@/features/session/components/conversation/InlinePermission';
import type { InlineContext } from '@/features/session/components/conversation/timeline-context';
import type { InlineRequests } from '@/features/session/hooks/useInlineRequests';
import { FOLDER } from '../../../support/editor';
import { render, translator } from '../../../support/render';
import { aWireError, routeApi, SESSION } from '../../../support/session-tools';
import { aToolCall } from '../../../support/canonical-tool';

const t = translator('en');
const ROUTE = `/sessions/${SESSION}/tools/toolu_1/diff`;

function aRequest(name: string, input: Record<string, unknown>): PermissionRequest {
  return {
    requestId: `req-${name}`,
    frameId: 'frame-1',
    toolUseId: 'toolu_1',
    ...aToolCall(name, input, FOLDER),
    description: JSON.stringify(input),
    riskHint: 'write',
    defaultToNo: true,
    expiresAt: '2026-10-01T12:02:00.000Z',
    suggestions: [{ scope: 'once', labelKey: 'permission.scope.once', rule: null }],
    reaches: [],
    interaction: null,
    isAnswering: false,
  };
}

function inlineOf(request: PermissionRequest): InlineContext {
  const requests = {
    pending: [request],
    settled: [],
    remainingMs: { [request.requestId]: 60_000 },
    refusal: null,
    answer: vi.fn(),
    extend: vi.fn(),
    byTool: new Map(),
    settledByTool: new Map(),
    drafts: {},
    saveDraft: vi.fn(),
    answerQuestion: vi.fn(),
    declineQuestion: vi.fn(),
  } satisfies InlineRequests;

  return { requests, sessionId: SESSION, folder: FOLDER };
}

function show(request: PermissionRequest) {
  return render(
    <ul>
      <InlinePermission request={request} inline={inlineOf(request)} />
    </ul>,
  );
}

/** The preview the server computes of a pending call — plan 28, B-17. */
function aPreview(overrides: Record<string, unknown> = {}) {
  return {
    path: `${FOLDER}/src/a.ts`,
    kind: 'file.edit',
    pending: true,
    scope: 'file',
    before: { state: 'content', content: 'one\ntwo\n' },
    after: { state: 'content', content: 'one\nTWO\n' },
    hunks: [
      {
        id: 'h1',
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 1,
        lines: [
          { kind: 'removed', text: 'two' },
          { kind: 'added', text: 'TWO' },
        ],
      },
    ],
    ...overrides,
  };
}

const EDIT = { file_path: `${FOLDER}/src/a.ts`, old_string: 'two', new_string: 'TWO' };

const preview = () => screen.findByRole('group', { name: t('sessions.diff.pendingLabel') });

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    focusManager.setFocused(undefined);
  });
});

/**
 * The card that asks shows what an edit would do, before it is approved (plan 08, B-29) — now as the
 * server computes it from the call's changes, against the disk now (plan 28, B-17, S-53).
 */
describe('the preview of a pending change on the card that asks — plan 28 B-17', () => {
  it('shows an edit against the disk now, from the route, and says when — S-127', async () => {
    const get = routeApi({ [ROUTE]: [aPreview()] });
    show(aRequest('Edit', EDIT));

    const diff = await preview();
    expect(within(diff).getByText('two')).toBeInTheDocument();
    expect(within(diff).getByText('TWO')).toBeInTheDocument();
    expect(screen.getByText(/Preview against the file as it was at/)).toBeVisible();
    expect(get).toHaveBeenCalledWith(ROUTE);
    // What was done opens in the editor; what would be done does not.
    expect(screen.queryByRole('button', { name: t('sessions.diff.open') })).toBeNull();
  });

  it('shows the write of a new file — S-128', async () => {
    routeApi({
      [ROUTE]: [
        aPreview({
          kind: 'file.write',
          before: { state: 'absent' },
          hunks: [
            {
              id: 'h1',
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              lines: [{ kind: 'added', text: 'hello' }],
            },
          ],
        }),
      ],
    });
    show(aRequest('Write', { file_path: `${FOLDER}/new.md`, content: 'hello\n' }));

    expect(within(await preview()).getByText('hello')).toBeInTheDocument();
  });

  it.each([
    ['editMissing', 0, t('sessions.diffReason.editMissing', { edit: 1 })],
    ['editAmbiguous', 2, t('sessions.diffReason.editAmbiguous', { edit: 3 })],
  ])(
    'says a replacement would not apply (%s), with its number, and invents nothing — S-129',
    async (reason, edit, text) => {
      routeApi({
        [ROUTE]: [aPreview({ after: { state: 'unavailable', reason, edit }, hunks: [] })],
      });
      show(aRequest('MultiEdit', { file_path: `${FOLDER}/src/a.ts`, edits: [] }));

      expect(await screen.findByText(text)).toBeVisible();
      expect(screen.queryByText(t('sessions.diff.unchanged'))).toBeNull();
      expect(screen.queryByRole('group', { name: t('sessions.diff.pendingLabel') })).toBeNull();
    },
  );

  it('says why there is no preview, with the way to try again, and keeps the exact detail — S-130', async () => {
    routeApi({ [ROUTE]: [aWireError('FILE_NOT_TEXT', 'files.error.notText')] });
    show(aRequest('Edit', { ...EDIT, old_string: 'a' }));

    expect(await screen.findByText(t('files.error.notText'))).toBeVisible();
    expect(screen.getByText(/"old_string":"a"/)).toBeVisible();
  });

  it('reads the disk again when the window gets the focus back — S-131', async () => {
    routeApi({
      [ROUTE]: [
        aPreview(),
        aPreview({ after: { state: 'unavailable', reason: 'editMissing', edit: 0 }, hunks: [] }),
      ],
    });
    show(aRequest('Edit', EDIT));
    await preview();

    act(() => {
      focusManager.setFocused(false);
    });
    act(() => {
      focusManager.setFocused(true);
    });

    expect(
      await screen.findByText(t('sessions.diffReason.editMissing', { edit: 1 })),
    ).toBeVisible();
  });

  it('says when a write would change nothing', async () => {
    routeApi({ [ROUTE]: [aPreview({ hunks: [] })] });
    show(aRequest('Write', { file_path: `${FOLDER}/a.md`, content: 'same' }));

    expect(await screen.findByText(t('sessions.diff.unchanged'))).toBeVisible();
  });

  it('asks for no preview of a call that changes no file — S-54', () => {
    const get = routeApi({});
    show(aRequest('Bash', { command: 'ls' }));
    // A file the call deletes or moves has no diff either.
    show({
      ...aRequest('Edit', EDIT),
      requestId: 'req-move',
      changes: [{ path: '/a', op: 'move', to: '/b' }],
    });

    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText(t('sessions.diff.loading'))).toBeNull();
  });

  it('has no accessibility violation', async () => {
    routeApi({ [ROUTE]: [aPreview()] });
    const { container } = show(aRequest('Edit', EDIT));
    await preview();

    expect(await axe(container)).toHaveNoViolations();
  });
});
