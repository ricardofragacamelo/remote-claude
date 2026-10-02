import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Envelope } from '@remote-claude/contracts';

import { registerClaudeChanges } from '@/features/session';
import { Conversation } from '@/features/session/components/Conversation';
import { INLINE_DIFF_LINES } from '@/features/session/components/conversation/ToolDiffView';
import { readEvent, SILENT } from '@/features/session/services/conversation-reducer';
import { EditorWorkspace } from '@/features/editor/components/EditorWorkspace';
import { FOLDER, editorState } from '../../../support/editor';
import { renderRouted, translator } from '../../../support/render';
import { aWireError, routeApi, SESSION } from '../../../support/session-tools';

const t = translator('en');
const FILE = `${FOLDER}/src/app.ts`;
const ROUTE = `/sessions/${SESSION}/tools/toolu_1/diff`;

function frame(type: string, payload: Record<string, unknown>): Envelope {
  return {
    v: 1,
    id: `f-${type}`,
    kind: 'event',
    type,
    ts: '2026-10-01T12:00:00.000Z',
    payload,
  } as Envelope;
}

/** A conversation with one `Edit` of `src/app.ts` that ran. */
function anEdit(status = 'succeeded') {
  return [
    frame('tool.started', {
      toolUseId: 'toolu_1',
      toolName: 'Edit',
      input: { file_path: FILE, old_string: 'a', new_string: 'b' },
    }),
    frame('tool.completed', { toolUseId: 'toolu_1', status }),
  ].reduce(readEvent, SILENT);
}

/** A diff of `count` changed lines, the whole file known. */
function aDiff(count: number, overrides: Record<string, unknown> = {}) {
  return {
    path: FILE,
    toolName: 'Edit',
    scope: 'file',
    before: { state: 'content', content: 'old\n' },
    after: { state: 'content', content: 'new\n' },
    hunks: [
      {
        id: 'h1',
        oldStart: 1,
        newStart: 1,
        lines: Array.from({ length: count }, (_, index) => ({
          kind: 'added',
          text: `line ${String(index)}`,
        })),
      },
    ],
    ...overrides,
  };
}

function show(conversation = anEdit()) {
  return renderRouted(
    <>
      <Conversation
        conversation={conversation}
        isPartial={false}
        folder={FOLDER}
        sessionId={SESSION}
      />
      <EditorWorkspace folder={FOLDER} />
    </>,
  );
}

let unregister: () => void;

beforeAll(() => {
  unregister = registerClaudeChanges();
});

afterAll(() => {
  unregister();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What Claude changed, in the chat and in the editor of the same tab — plan 08, B-27. */
describe('the diff of a tool in the chat', () => {
  it(`shows the diff of an edit inline, folded past ${String(INLINE_DIFF_LINES)} lines — S-119`, async () => {
    routeApi({ [ROUTE]: [aDiff(INLINE_DIFF_LINES + 5)] });
    show();

    const diff = await screen.findByRole('group', {
      name: t('sessions.diff.label', { name: 'app.ts' }),
    });
    expect(within(diff).getAllByRole('listitem')).toHaveLength(INLINE_DIFF_LINES);

    await userEvent.click(
      screen.getByRole('button', {
        name: t('diff.hunks.showAll', { count: INLINE_DIFF_LINES + 5 }),
      }),
    );
    expect(within(diff).getAllByRole('listitem')).toHaveLength(INLINE_DIFF_LINES + 5);
    expect(
      within(diff).getAllByText(t('diff.line.added').trim(), { exact: false }),
    ).not.toHaveLength(0);
  });

  it('opens the diff in the editor of the same tab, and opening it again focuses it — S-120', async () => {
    routeApi({ [ROUTE]: [aDiff(1)] });
    show();

    const open = await screen.findByRole('button', { name: t('sessions.diff.open') });
    await userEvent.click(open);

    expect(
      await screen.findByRole('textbox', { name: t('sessions.diff.before', { name: 'app.ts' }) }),
    ).toHaveValue('old\n');
    expect(
      screen.getByRole('textbox', { name: t('sessions.diff.after', { name: 'app.ts' }) }),
    ).toHaveValue('new\n');

    await userEvent.click(open);
    const tabs = editorState().groups.flatMap((group) => group.tabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      kind: 'diff',
      left: { source: 'provided', path: 'src/app.ts' },
    });
  });

  it('says why a side is not known, and offers no diff tab for a partial one', async () => {
    routeApi({
      [ROUTE]: [
        aDiff(1, {
          scope: 'edit',
          before: { state: 'unavailable', reason: 'laterTouch' },
          after: { state: 'unavailable', reason: 'whatever' },
        }),
      ],
    });
    show();

    expect(await screen.findByText(t('sessions.diffReason.laterTouch'))).toBeVisible();
    expect(screen.getByText(t('sessions.diffReason.unknown'))).toBeVisible();
    expect(screen.queryByRole('button', { name: t('sessions.diff.open') })).toBeNull();
  });

  it('says why the diff failed in the card, and the conversation stays — S-121', async () => {
    const get = routeApi({
      [ROUTE]: [aWireError('SESSION_NOT_FOUND', 'session.error.notFound'), aDiff(1)],
    });
    show();

    expect(await screen.findByRole('alert')).toHaveTextContent(t('session.error.notFound'));
    expect(screen.getByRole('button', { name: /Edit/ })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(
      await screen.findByRole('group', { name: t('sessions.diff.label', { name: 'app.ts' }) }),
    ).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('asks for no diff of a tool that failed, and of a conversation read from the history', () => {
    const get = routeApi({});
    show(anEdit('failed'));
    act(() => undefined);

    expect(get).not.toHaveBeenCalled();
  });

  it('reads a side the editor cannot know as an error of the tab', async () => {
    routeApi({ [ROUTE]: [aDiff(1, { after: { state: 'notRestorable', reason: 'tooLarge' } })] });
    show();

    await userEvent.click(await screen.findByRole('button', { name: t('sessions.diff.open') }));

    expect(await screen.findByText(t('sessions.diff.sideUnknown'))).toBeVisible();
  });
});
