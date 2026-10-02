import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { useEditAndResend } from '@/features/session/hooks/useEditAndResend';
import { claudePanelStore } from '@/features/session/store/claude-panel.store';
import { folderTabStore, forgetFolderTabs } from '@/features/workbench';
import { aHistoryPage, claudeUnavailable, said } from '../../../support/history';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { typeIn } from '../../../support/workbench';
import {
  aCheckpointDto,
  aCommandMenu,
  aRefusal,
  routeApi,
  SESSION,
} from '../../../support/session-tools';

const t = translator('en');
const A = '/srv/projects/app';
const CONVERSATION = 'conv-1';
const FORKED = '01J0FORKEDFORKEDFORKEDFORK';
const PATHS = {
  models: `/sessions/${SESSION}/models`,
  context: `/sessions/${SESSION}/context`,
  mcp: `/sessions/${SESSION}/mcp-servers`,
  checkpoints: `/sessions/${SESSION}/checkpoints`,
  commands: `/sessions/${SESSION}/commands`,
  history: `/transcripts/${CONVERSATION}/messages`,
};

const OPUS = {
  value: 'opus',
  resolvedModel: 'claude-opus-5',
  displayName: 'Opus',
  description: 'Most capable',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'high'],
};
const HAIKU = { value: 'haiku', displayName: 'Haiku', description: 'Fastest' };

const aContext = (percentage: number) => ({
  model: 'claude-opus-5',
  totalTokens: 1200,
  maxTokens: 200_000,
  percentage,
  categories: [
    { id: 'messages', name: 'Messages', tokens: 800, kind: 'used' },
    { id: 'customThing', name: 'Custom thing', tokens: 40, kind: 'used' },
  ],
});

let live: LiveSocket;
let seq = 1;

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
  seq = 1;
});

afterEach(() => {
  live.close();
  forgetFolderTabs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The screen as the panel hosts it: with the editing of prompts. */
function Hosted(): React.JSX.Element {
  const edit = useEditAndResend(A, SESSION);
  return <SessionScreen sessionId={SESSION} folder={A} edit={edit} />;
}

/** What the session says next, numbered after what it said before. */
function says(type: string, payload: Record<string, unknown>): void {
  seq += 1;
  live.receive(hubEvent(SESSION, type, seq, payload));
}

/** The answers of the server for the reads of the header — every one routed, each overridable. */
function served(
  routes: Partial<Record<keyof typeof PATHS, readonly unknown[]>> = {},
  extra: Record<string, readonly unknown[]> = {},
) {
  return routeApi({
    ...extra,
    [PATHS.models]: routes.models ?? [{ current: 'opus', models: [OPUS, HAIKU] }],
    [PATHS.context]: routes.context ?? [aContext(40)],
    [PATHS.mcp]: routes.mcp ?? [{ servers: [] }],
    [PATHS.checkpoints]: routes.checkpoints ?? [{ checkpoints: [] }],
    [PATHS.commands]: routes.commands ?? [aCommandMenu()],
    [PATHS.history]: routes.history ?? [aHistoryPage([])],
  });
}

/** The screen of a session that opened on its conversation, connected. */
function opened(started: Record<string, unknown> = {}): ReturnType<typeof render> {
  const mounted = render(<Hosted />);
  live.connect();
  live.receive(
    hubEvent(SESSION, 'session.started', 1, {
      sessionId: SESSION,
      claudeSessionId: CONVERSATION,
      workspacePath: A,
      model: 'claude-opus-5',
      permissionMode: 'default',
      ...started,
    }),
  );
  return mounted;
}

const header = (): HTMLElement => screen.getByRole('group', { name: t('sessions.header.label') });
const box = (): HTMLElement => screen.getByLabelText(t('session.composer.label'));

describe('the queue of prompts, above the box — plan 08, B-34', () => {
  const queue = (): HTMLElement => screen.getByRole('region', { name: t('sessions.queue.title') });

  it('is not there while nothing waits', () => {
    served();
    opened();

    expect(screen.queryByRole('region', { name: t('sessions.queue.title') })).toBeNull();
  });

  it('shows what waits, in the order it arrived, from each client — S-156, S-160', async () => {
    served();
    opened();

    says('prompt.queued', { queueId: 'q1', promptedBy: 'mobile', preview: 'run the tests' });
    says('prompt.queued', { queueId: 'q2', promptedBy: 'web', preview: 'and lint' });
    says('prompt.queued', { queueId: 'q3', promptedBy: 'cli', preview: 'and ship' });

    const rows = within(await screen.findByRole('region', { name: t('sessions.queue.title') }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toEqual([
      `${t('sessions.queue.position', { position: 1 })}run the tests${t('sessions.queue.fromMobile')}`,
      `${t('sessions.queue.position', { position: 2 })}and lint${t('sessions.queue.fromWeb')}`,
      `${t('sessions.queue.position', { position: 3 })}and ship${t('sessions.queue.fromOther')}`,
    ]);
  });

  it('takes one out before it reaches Claude, and the rest move up — S-157', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('prompt.queued', { queueId: 'q1', promptedBy: 'web', preview: 'first' });
    says('prompt.queued', { queueId: 'q2', promptedBy: 'web', preview: 'second' });

    await user.click(
      within(queue()).getByRole('button', { name: t('sessions.queue.cancel', { position: 1 }) }),
    );
    expect(live.lastSent('session.cancelQueuedPrompt')).toMatchObject({
      payload: { sessionId: SESSION, queueId: 'q1' },
    });

    says('prompt.dequeued', { queueId: 'q1', reason: 'cancelled' });
    expect(within(queue()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(queue()).getByText('second')).toBeVisible();
    expect(within(queue()).getByText(t('sessions.queue.position', { position: 1 }))).toBeVisible();
  });

  it('says why a cancel came too late — the prompt had just started — S-158', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('prompt.queued', { queueId: 'q1', promptedBy: 'web', preview: 'first' });

    await user.click(
      within(queue()).getByRole('button', { name: t('sessions.queue.cancel', { position: 1 }) }),
    );
    const cancel = live.lastSent('session.cancelQueuedPrompt');
    live.receive(aRefusal(String(cancel?.['id']), 'CONFLICT', 'session.error.queuedPromptStarted'));
    says('prompt.dequeued', { queueId: 'q1', reason: 'started' });

    expect(await screen.findByText(t('session.error.queuedPromptStarted'))).toBeVisible();
  });
});

describe('the model, the mode — plan 08, B-36', () => {
  const picker = (label: string, value: string): HTMLElement =>
    within(header()).getByRole('button', { name: `${label}: ${value}` });

  it('lists the installation’s models, its words, and switches the model — S-166, S-169', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(await within(header()).findByRole('button', { name: /^Model: Opus$/ }));
    expect(await screen.findByRole('menuitem', { name: /Most capable/ })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: /^Haiku/ }));

    expect(live.lastSent('session.setModel')).toMatchObject({
      payload: { sessionId: SESSION, model: 'haiku' },
    });
    expect(picker(t('sessions.model.label'), 'Haiku')).toBeVisible();
  });

  it('keeps the model in use, and the box, when the list cannot be had — S-168', async () => {
    served({ models: [{ ...claudeUnavailable }] });
    opened();

    await waitFor(() => {
      expect(picker(t('sessions.model.label'), 'claude-opus-5')).toBeDisabled();
    });
    expect(box()).toBeEnabled();
  });

  it('offers the three modes — never one that skips every question — S-170', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(picker(t('sessions.mode.label'), t('sessions.mode.default')));
    const modes = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(modes).toEqual([
      `${t('sessions.mode.default')}${t('sessions.mode.defaultDescription')}`,
      `${t('sessions.mode.acceptEdits')}${t('sessions.mode.acceptEditsDescription')}`,
      `${t('sessions.mode.plan')}${t('sessions.mode.planDescription')}`,
    ]);

    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(t('sessions.mode.acceptEdits')) }),
    );

    expect(live.lastSent('session.setPermissionMode')).toMatchObject({
      payload: { sessionId: SESSION, mode: 'acceptEdits' },
    });
    expect(screen.getByRole('note')).toHaveTextContent(t('sessions.mode.acceptEditsWarning'));
  });
});

describe('the context window — plan 08, B-37', () => {
  it('shows how full it is, by category, and warns near the limit — S-173', async () => {
    const user = userEvent.setup();
    served({ context: [aContext(85)] });
    opened();

    const meter = await within(header()).findByRole('button', {
      name: t('sessions.context.label', { percentage: 85 }),
    });
    expect(within(meter).getByRole('meter')).toHaveAttribute('aria-valuenow', '85');
    await user.click(meter);

    expect(await screen.findByText(t('sessions.context.messages'))).toBeVisible();
    expect(screen.getByText('Custom thing')).toBeVisible();
    expect(screen.getByText(t('sessions.context.tokens', { tokens: 800 }))).toBeVisible();
    expect(screen.getByText(t('sessions.context.near'))).toBeVisible();
  });

  it('does not warn far from the limit', async () => {
    const user = userEvent.setup();
    served({ context: [aContext(40)] });
    opened();

    await user.click(
      await within(header()).findByRole('button', {
        name: t('sessions.context.label', { percentage: 40 }),
      }),
    );

    expect(await screen.findByText(t('sessions.context.messages'))).toBeVisible();
    expect(screen.queryByText(t('sessions.context.near'))).toBeNull();
  });

  it('compacts by the installation’s own /compact, and reads the use again after it — S-174', async () => {
    const user = userEvent.setup();
    const get = served({ context: [aContext(85), aContext(10)] });
    opened();

    await user.click(
      await within(header()).findByRole('button', { name: t('sessions.context.compact') }),
    );
    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: SESSION, text: '/compact' },
    });

    says('session.compacted', { trigger: 'manual', preTokens: 1200 });
    says('turn.completed', { turnId: 'turn-1', costUsd: '0.01', durationMs: 1000 });

    expect(
      await within(header()).findByRole('button', {
        name: t('sessions.context.label', { percentage: 10 }),
      }),
    ).toBeVisible();
    expect(get.mock.calls.filter(([path]) => path === PATHS.context)).toHaveLength(2);
  });

  it('steps aside with the reason when the use cannot be read, the box going on — S-175', async () => {
    served({ context: [{ ...claudeUnavailable }] });
    opened();

    expect(
      await within(header()).findByRole('img', { name: t('sessions.context.unavailable') }),
    ).toBeVisible();
    expect(box()).toBeEnabled();
  });
});

describe('the MCP servers — plan 08, B-38', () => {
  it('shows each server and how it stands, and nothing raw — S-176, S-177, S-179', async () => {
    const user = userEvent.setup();
    served({
      mcp: [
        {
          servers: [
            { name: 'docs', status: 'connected', toolCount: 4, error: 'raw failure' },
            { name: 'jira', status: 'failed', toolCount: 0 },
            { name: 'drive', status: 'needs-auth', toolCount: 0 },
            { name: 'slack', status: 'pending', toolCount: 0 },
            { name: 'old', status: 'disabled', toolCount: 1 },
          ],
        },
      ],
    });
    opened();

    await user.click(
      await within(header()).findByRole('button', {
        name: t('sessions.mcp.summary', { fine: 1, count: 5 }),
      }),
    );

    const menu = await screen.findByRole('menu');
    for (const [name, status, tools] of [
      ['docs', 'sessions.mcp.connected', 4],
      ['jira', 'sessions.mcp.failed', 0],
      ['drive', 'sessions.mcp.needsAuth', 0],
      ['slack', 'sessions.mcp.pending', 0],
      ['old', 'sessions.mcp.disabled', 1],
    ] as const) {
      expect(within(menu).getByText(name)).toBeVisible();
      expect(
        within(menu).getAllByText(
          t('sessions.mcp.line', {
            status: t(status),
            tools: t('sessions.mcp.tools', { count: tools }),
          }),
        ).length,
      ).toBeGreaterThan(0);
    }
    expect(within(menu).queryByText(/raw failure/)).toBeNull();
    expect(within(menu).queryByRole('link')).toBeNull();
  });

  it('is not there with no server — S-178', async () => {
    const get = served();
    opened();

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(PATHS.mcp);
    });
    expect(within(header()).queryByRole('button', { name: /MCP/ })).toBeNull();
  });

  it('says so in a line when they cannot be read, never in the way of the chat — S-178', async () => {
    served({ mcp: [{ ...claudeUnavailable }] });
    opened();

    expect(await within(header()).findByText(t('sessions.mcp.unavailable'))).toBeVisible();
    expect(box()).toBeEnabled();
  });
});

describe('exporting the conversation — plan 08, B-39', () => {
  /** What the browser was handed to save: the text and its name, or nothing. */
  function savedFiles(): { texts: Promise<string>[]; names: string[] } {
    const saved = { texts: [] as Promise<string>[], names: [] as string[] };
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        saved.texts.push(blob.text());
        return 'blob:export';
      },
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.names.push(this.download);
    });
    return saved;
  }

  const tool = [
    {
      type: 'tool.started',
      payload: { toolUseId: 't1', toolName: 'Bash', input: { command: 'npm test' } },
    },
    {
      type: 'tool.completed',
      payload: { toolUseId: 't1', status: 'succeeded', summary: 'all green' },
    },
  ];

  async function exportIt(user: ReturnType<typeof userEvent.setup>, outputs: boolean) {
    await user.click(within(header()).getByRole('button', { name: t('sessions.export.open') }));
    if (outputs) {
      await user.click(await screen.findByLabelText(t('sessions.export.withOutputs')));
    }
    await user.click(await screen.findByRole('button', { name: t('sessions.export.save') }));
  }

  it('writes every page of it, oldest first, the tools without their output — S-180', async () => {
    const user = userEvent.setup();
    const saved = savedFiles();
    served(
      { history: [aHistoryPage([...tool, said('m2', 'Done.')], { nextCursor: 'older' })] },
      { [`${PATHS.history}?cursor=older`]: [aHistoryPage([said('m1', 'run the tests', 'user')])] },
    );
    opened();

    await exportIt(user, false);

    await waitFor(() => {
      expect(saved.names).toEqual([`conversation-${CONVERSATION}.md`]);
    });
    const markdown = await saved.texts[0];
    expect(markdown?.indexOf('run the tests')).toBeLessThan(markdown?.indexOf('Done.') ?? 0);
    expect(markdown).toContain('npm test');
    expect(markdown).not.toContain('all green');
  });

  it('adds the outputs only when asked — S-181', async () => {
    const user = userEvent.setup();
    const saved = savedFiles();
    served({ history: [aHistoryPage(tool)] });
    opened();

    await exportIt(user, true);

    await waitFor(() => {
      expect(saved.texts).toHaveLength(1);
    });
    expect(await saved.texts[0]).toContain('all green');
  });

  it('saves nothing when a page fails halfway, and says why — S-182', async () => {
    const user = userEvent.setup();
    const saved = savedFiles();
    served(
      { history: [aHistoryPage([said('m2', 'Done.')], { nextCursor: 'older' })] },
      { [`${PATHS.history}?cursor=older`]: [{ ...claudeUnavailable }] },
    );
    opened();

    await exportIt(user, false);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('sessions.export.failed', { reason: t('transcript.error.claudeUnavailable') }),
    );
    expect(saved.names).toEqual([]);
  });

  it('is not offered before the conversation is known', () => {
    served();
    opened({ claudeSessionId: undefined });

    expect(
      within(header()).getByRole('button', { name: t('sessions.export.open') }),
    ).toBeDisabled();
  });
});

describe('Esc in the prompt box — plan 08, B-40', () => {
  const interrupts = (): number =>
    live.sent().filter((frame) => frame['type'] === 'session.interrupt').length;

  it('interrupts the turn running, once however often it is pressed — S-183, S-184', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('session.statusChanged', { status: 'running' });

    box().focus();
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');

    expect(interrupts()).toBe(1);
  });

  it('does nothing with no turn running — S-184', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('session.statusChanged', { status: 'idle' });

    box().focus();
    await user.keyboard('{Escape}');

    expect(interrupts()).toBe(0);
  });

  it('leaves the Esc that something else took to it — S-183', () => {
    served();
    opened();
    says('session.statusChanged', { status: 'running' });

    const taken = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    taken.preventDefault();
    fireEvent(box(), taken);

    expect(interrupts()).toBe(0);
  });
});

describe('editing a prompt and sending it again — plan 08, B-35', () => {
  /** The conversation so far: one prompt, its answer. */
  function conversed(): void {
    says('message.completed', {
      messageId: 'u1',
      role: 'user',
      content: [{ type: 'text', text: 'fix the parser' }],
    });
    says('message.completed', {
      messageId: 'a1',
      role: 'assistant',
      content: [{ type: 'text', text: 'Fixed.' }],
    });
  }

  const editButton = (): HTMLElement =>
    screen.getByRole('button', { name: t('sessions.message.edit') });

  /** The server opening the fork the screen asked for. */
  function forkOpened(): void {
    live.receive({
      v: 1,
      id: 'started-fork',
      kind: 'event',
      type: 'session.started',
      ts: '2026-09-30T12:00:00.000Z',
      seq: 1,
      correlationId: live.lastSent('session.start')?.['id'],
      payload: { sessionId: FORKED, workspacePath: A },
    });
  }

  it('forks the conversation before the prompt, and sends the edited one there — S-161', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    await user.click(editButton());
    expect(screen.getByRole('note')).toHaveTextContent(t('sessions.edit.explain'));
    expect(box()).toHaveValue('fix the parser');
    await typeIn(user, box(), ' properly');
    await user.click(screen.getByRole('button', { name: t('sessions.edit.send') }));

    expect(live.lastSent('session.start')).toMatchObject({
      payload: { workspacePath: A, resumeSessionId: CONVERSATION, forkAt: 'u1' },
    });
    expect(live.lastSent('session.rewindFiles')).toBeUndefined();

    forkOpened();

    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: FORKED, text: 'fix the parser properly' },
    });
    expect(claudePanelStore(A).getState().active).toBe(`session:${FORKED}`);
    expect(folderTabStore(A).getState().sessionId).toBe(FORKED);
    // The original stays as it was, readable.
    expect(screen.getByText('Fixed.')).toBeVisible();
  });

  it('offers the undo of that turn, off by default, and sends it first when ticked — S-162', async () => {
    const user = userEvent.setup();
    served({
      checkpoints: [{ checkpoints: [aCheckpointDto({ promptId: 'p1', label: 'fix the parser' })] }],
    });
    opened();
    conversed();

    await user.click(editButton());
    const undo = await screen.findByRole('checkbox', { name: t('sessions.edit.undoFiles') });
    await waitFor(() => {
      expect(undo).toBeEnabled();
    });
    expect(undo).not.toBeChecked();
    await user.click(undo);
    await user.click(screen.getByRole('button', { name: t('sessions.edit.send') }));

    const sent = live.sent().map((frame) => frame['type']);
    expect(sent.indexOf('session.rewindFiles')).toBeLessThan(sent.lastIndexOf('session.start'));
    expect(live.lastSent('session.rewindFiles')).toMatchObject({
      payload: { sessionId: SESSION, promptId: 'p1' },
    });
  });

  it('says when no file of that turn can go back, and offers nothing to tick', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    await user.click(editButton());

    expect(screen.getByRole('checkbox', { name: t('sessions.edit.undoFiles') })).toBeDisabled();
    expect(screen.getByText(t('sessions.edit.noUndo'))).toBeVisible();
  });

  it('offers the plain resume when the CLI refuses the point — never the same fork — S-164', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    await user.click(editButton());
    await user.click(screen.getByRole('button', { name: t('sessions.edit.send') }));
    forkOpened();
    live.receive({
      v: 1,
      id: 'err-fork',
      kind: 'error',
      type: 'error',
      ts: '2026-09-30T12:00:00.000Z',
      sessionId: FORKED,
      traceId: 'trace-fork',
      payload: {
        code: 'SESSION_FORK_REJECTED',
        messageKey: 'session.error.forkRejected',
        params: {},
      },
    });

    expect(await screen.findByText(t('session.error.forkRejected'))).toBeVisible();
    const starts = live.sent().filter((frame) => frame['type'] === 'session.start').length;
    await user.click(screen.getByRole('button', { name: t('sessions.edit.resumeInstead') }));

    expect(live.sent().filter((frame) => frame['type'] === 'session.start')).toHaveLength(
      starts + 1,
    );
    expect(live.lastSent('session.start')).toEqual(
      expect.objectContaining({
        payload: { workspacePath: A, resumeSessionId: CONVERSATION },
      }),
    );
  });

  it('says why the fork could not start, translated — S-163', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    await user.click(editButton());
    await user.click(screen.getByRole('button', { name: t('sessions.edit.send') }));
    live.receive(
      aRefusal(
        String(live.lastSent('session.start')?.['id']),
        'INVALID_INPUT',
        'session.error.forkPointUnknown',
      ),
    );

    expect(await screen.findByText(t('session.error.forkPointUnknown'))).toBeVisible();
    expect(live.lastSent('session.prompt')).toBeUndefined();
  });

  it('forks from here, the prompt unchanged — from the first prompt too — S-165', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    fireEvent.contextMenu(screen.getByText('fix the parser'));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.message.forkFrom') }));

    expect(live.lastSent('session.start')).toMatchObject({
      payload: { resumeSessionId: CONVERSATION, forkAt: 'u1' },
    });
    forkOpened();
    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: FORKED, text: 'fix the parser' },
    });
  });

  it('stops editing, and the box is the prompt box again', async () => {
    const user = userEvent.setup();
    served();
    opened();
    conversed();

    await user.click(editButton());
    await user.click(screen.getByRole('button', { name: t('sessions.edit.cancel') }));

    expect(screen.queryByText(t('sessions.edit.explain'))).toBeNull();
    expect(box()).toHaveValue('');
    expect(screen.getByRole('button', { name: t('session.composer.send') })).toBeVisible();
  });
});

describe('the header of the session — plan 08, S-195', () => {
  it('has no accessibility violation', async () => {
    served({ mcp: [{ servers: [{ name: 'docs', status: 'connected', toolCount: 1 }] }] });
    const { container } = opened();
    await within(header()).findByRole('button', { name: /MCP/ });

    expect(await axe(container)).toHaveNoViolations();
  });
});
