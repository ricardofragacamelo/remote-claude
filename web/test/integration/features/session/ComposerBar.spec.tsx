import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EngineCapabilities } from '@remote-claude/contracts';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { useEditAndResend } from '@/features/session/hooks/useEditAndResend';
import { UNCHECKED } from '@/features/session/lib/context-set';
import { mentionProviders } from '@/features/session/lib/mention-providers';
import { agentPanelStore, forgetAgentPanel } from '@/features/session/store/agent-panel.store';
import { forgetFolderTabs } from '@/features/workbench';
import { aHistoryPage, agentUnavailable } from '../../../support/history';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { aCommandMenu, aRefusal, routeApi, SESSION } from '../../../support/session-tools';
import { typeIn } from '../../../support/workbench';
import { anEngineList, CAPABILITIES } from '../../../support/engines';

const t = translator('en');
const A = '/srv/projects/app';
const CONVERSATION = 'conv-1';
const OPUS = {
  value: 'opus',
  resolvedModel: 'claude-opus-5',
  displayName: 'Opus',
  description: 'Most capable',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'high'],
};

let live: LiveSocket;
let seq = 1;

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
  seq = 1;
});

afterEach(() => {
  live.close();
  forgetAgentPanel(null);
  forgetFolderTabs();
  vi.restoreAllMocks();
});

/** The screen as the panel hosts it: with the editing of prompts. */
function Hosted(): React.JSX.Element {
  const edit = useEditAndResend(A, SESSION);
  return <SessionScreen sessionId={SESSION} folder={A} edit={edit} />;
}

function served(extra: Record<string, readonly unknown[]> = {}) {
  return routeApi({
    [`/sessions/${SESSION}/models`]: [{ current: 'opus', models: [OPUS] }],
    [`/sessions/${SESSION}/context`]: [
      {
        model: 'opus',
        totalTokens: 1_000,
        maxTokens: 200_000,
        percentage: 85,
        categories: [
          {
            id: 'messages',
            messageKey: 'sessions.context.messages',
            name: 'Messages',
            tokens: 800,
            kind: 'used',
          },
        ],
      },
    ],
    [`/sessions/${SESSION}/mcp-servers`]: [{ servers: [] }],
    [`/sessions/${SESSION}/commands`]: [aCommandMenu()],
    [`/transcripts/claude/${CONVERSATION}/messages`]: [aHistoryPage([])],
    [`/files/tree?folder=${encodeURIComponent(A)}&path=`]: [
      { entries: [{ name: 'src', kind: 'directory' }], truncated: false },
    ],
    ...extra,
  });
}

function says(type: string, payload: Record<string, unknown>): void {
  seq += 1;
  live.receive(hubEvent(SESSION, type, seq, payload));
}

function opened(capabilities: EngineCapabilities = CAPABILITIES): ReturnType<typeof render> {
  agentPanelStore(A).getState().show('session', SESSION);
  const mounted = render(<Hosted />);
  live.connect();
  live.receive(
    hubEvent(SESSION, 'session.started', 1, {
      sessionId: SESSION,
      conversation: { engine: 'claude', id: CONVERSATION },
      workspacePath: A,
      model: 'opus',
      permissionMode: 'ask',
      capabilities,
    }),
  );
  return mounted;
}

const box = (): HTMLTextAreaElement => screen.getByLabelText(t('composer.box.label'));
const stop = (): HTMLElement => screen.getByRole('button', { name: t('composer.send.stop') });
const sent = (type: string): Record<string, unknown>[] =>
  live.sent().filter((frame) => frame['type'] === type);
const chip = (label: string, value: string): HTMLElement =>
  screen.getByRole('button', { name: t('composer.chip.choice', { label, value }) });

/** The bar under the box: every control it holds, in the order of the screen. */
function barNames(): string[] {
  const bar = box().nextElementSibling as HTMLElement;
  return within(bar)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '');
}

describe('the bar of the box — plan 09, B-09', () => {
  it('holds +, /, the mode, the model, the effort, the context and send, in that order — S-18', async () => {
    served();
    opened();

    await waitFor(() => {
      expect(barNames()).toEqual([
        t('composer.add.open'),
        t('composer.slash.open'),
        t('composer.chip.choice', {
          label: t('sessions.mode.label'),
          value: t('sessions.mode.ask'),
        }),
        t('composer.chip.choice', { label: t('sessions.model.label'), value: 'Opus' }),
        t('composer.chip.choice', {
          label: t('sessions.effort.label'),
          value: t('sessions.effort.unknown'),
        }),
        t('composer.bar.more'),
        t('sessions.context.label', { percentage: 85 }),
        t('session.composer.send'),
      ]);
    });
    // The box is named for assistive technology; on screen it says what it is by itself.
    expect(screen.getByText(t('composer.box.label'))).toHaveClass('sr-only');
  });

  it('keeps the model and the effort a menu away when the bar is narrow', async () => {
    const user = userEvent.setup();
    served();
    opened();
    await screen.findByRole('button', { name: /^Model: Opus/ });

    await user.click(screen.getByRole('button', { name: t('composer.bar.more') }));

    expect(await screen.findByRole('menuitem', { name: /^Model: Opus/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Effort: / })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('leaves the plain box of an edited prompt with nothing to add to it — B-09', async () => {
    const user = userEvent.setup();
    served({ [`/transcripts/claude/${CONVERSATION}/messages`]: [aHistoryPage([])] });
    opened();
    says('message.completed', {
      messageId: 'u1',
      role: 'user',
      content: [{ type: 'text', text: 'first' }],
    });

    await user.click(await screen.findByRole('button', { name: t('sessions.message.edit') }));

    expect(screen.queryByRole('button', { name: t('composer.add.open') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('composer.slash.open') })).toBeNull();
  });
});

describe('send and stop, in one place — plan 09, B-10, D-06', () => {
  it('turns the button into stop while a turn runs with nothing written; two clicks interrupt once — S-19', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('session.statusChanged', { status: 'thinking' });

    expect(screen.queryByRole('button', { name: t('session.composer.send') })).toBeNull();
    await user.click(stop());
    await user.click(stop());

    expect(sent('session.interrupt')).toHaveLength(1);
  });

  it('sends to the queue with text written, and says so, with stop beside it — S-20', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('session.statusChanged', { status: 'running' });

    await typeIn(user, box(), 'next thing');
    const queue = screen.getByRole('button', { name: t('composer.send.queue') });
    expect(queue).toHaveAccessibleDescription(t('composer.send.queued'));
    expect(stop()).toBeInTheDocument();

    await user.click(queue);

    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: SESSION, text: 'next thing' },
    });
    expect(sent('session.interrupt')).toHaveLength(0);
  });

  it('closes an open menu with Esc and interrupts nothing; in the box, once per turn — S-21', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('session.statusChanged', { status: 'running' });

    await user.click(chip(t('sessions.mode.label'), t('sessions.mode.ask')));
    expect(await screen.findByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    // The focus is back on the chip that opened it (S-36).
    expect(chip(t('sessions.mode.label'), t('sessions.mode.ask'))).toHaveFocus();
    expect(sent('session.interrupt')).toHaveLength(0);

    box().focus();
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(sent('session.interrupt')).toHaveLength(1);
  });

  it('has no stop once the session ended, and sending resumes it — S-22', async () => {
    served();
    opened();
    says('session.closed', { sessionId: SESSION, reason: 'idleTimeout' });

    expect(screen.queryByRole('button', { name: t('composer.send.stop') })).toBeNull();
    await typeIn(userEvent.setup(), box(), 'go on');
    expect(screen.getByRole('button', { name: t('session.ended.resumeAndSend') })).toBeEnabled();
    // An ended session has no choices to make: sending opens a new process.
    expect(screen.queryByRole('group', { name: t('sessions.header.label') })).toBeNull();
  });
});

describe('the mode, the model and the effort in the bar — plan 09, B-11', () => {
  it('puts the chip back, with the refusal translated above the box — S-23', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(chip(t('sessions.mode.label'), t('sessions.mode.ask')));
    await user.click(
      await screen.findByRole('menuitem', {
        name: new RegExp(`^${t('sessions.mode.readOnly')}`),
      }),
    );
    expect(chip(t('sessions.mode.label'), t('sessions.mode.readOnly'))).toBeInTheDocument();

    const command = String(live.lastSent('session.setPermissionMode')?.['id']);
    live.receive(aRefusal(command, 'INVALID_INPUT', 'common.error.invalidInput'));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('common.error.invalidInput'));
    expect(chip(t('sessions.mode.label'), t('sessions.mode.ask'))).toBeInTheDocument();

    // The strip closes, and the box stays as it was.
    await user.click(screen.getByRole('button', { name: t('composer.refusal.close') }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the effort of a live session only, and says why — S-90', async () => {
    const user = userEvent.setup();
    served();
    const panel = agentPanelStore(A).getState();
    const draft = panel.openDraft();
    panel.setChoices(draft, { model: 'opus', mode: 'ask', effort: 'high' });
    panel.promote(draft, SESSION);
    opened();

    const effort = await screen.findByRole('button', {
      name: t('composer.chip.choice', {
        label: t('sessions.effort.label'),
        value: t('sessions.effort.high'),
      }),
    });
    expect(effort).toHaveAttribute('aria-disabled', 'true');
    expect(effort).toHaveAccessibleDescription(t('sessions.effort.readOnly'));

    await user.click(effort);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('what the engine announces, in the bar — plan 28, B-27, B-28', () => {
  const modeChip = (): HTMLElement | null =>
    screen.queryByRole('button', {
      name: new RegExp(
        `^${t('composer.chip.choice', { label: t('sessions.mode.label'), value: '' })}`,
      ),
    });

  it('offers exactly the modes the engine announces, in its order — S-81', async () => {
    const user = userEvent.setup();
    served();
    opened({ ...CAPABILITIES, permissionModes: ['readOnly', 'ask'] });

    await user.click(chip(t('sessions.mode.label'), t('sessions.mode.ask')));

    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent ?? '')).toEqual([
      expect.stringContaining(t('sessions.mode.readOnly')),
      expect.stringContaining(t('sessions.mode.ask')),
    ]);
  });

  it('has no mode chip for an engine with one mode — S-81', async () => {
    served();
    opened({ ...CAPABILITIES, permissionModes: ['ask'] });

    await screen.findByRole('button', {
      name: t('composer.chip.choice', { label: t('sessions.model.label'), value: 'Opus' }),
    });
    expect(modeChip()).toBeNull();
  });

  it('has no effort chip for an engine that announces no level — S-83', async () => {
    served();
    const panel = agentPanelStore(A).getState();
    const draft = panel.openDraft();
    panel.setChoices(draft, { model: 'opus', mode: 'ask', effort: 'high' });
    panel.promote(draft, SESSION);
    opened({ ...CAPABILITIES, effortLevels: [] });

    await screen.findByRole('button', {
      name: t('composer.chip.choice', { label: t('sessions.model.label'), value: 'Opus' }),
    });
    expect(
      screen.queryByRole('button', {
        name: t('composer.chip.choice', {
          label: t('sessions.effort.label'),
          value: t('sessions.effort.high'),
        }),
      }),
    ).toBeNull();
  });

  it('names a level this build does not know as the engine named it', async () => {
    served();
    const panel = agentPanelStore(A).getState();
    const draft = panel.openDraft();
    panel.setChoices(draft, { model: 'opus', mode: 'ask', effort: 'turbo' });
    panel.promote(draft, SESSION);
    opened();

    expect(
      await screen.findByRole('button', {
        name: t('composer.chip.choice', { label: t('sessions.effort.label'), value: 'turbo' }),
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('takes the modes from the list of engines before the session says them', async () => {
    served({ '/engines': [anEngineList()] });
    agentPanelStore(A).getState().show('session', SESSION);
    render(<Hosted />);
    live.connect();
    live.receive(
      hubEvent(SESSION, 'session.started', 1, {
        sessionId: SESSION,
        conversation: { engine: 'claude', id: CONVERSATION },
        workspacePath: A,
        model: 'opus',
        permissionMode: 'acceptEdits',
      }),
    );

    expect(
      await screen.findByRole('button', {
        name: t('composer.chip.choice', {
          label: t('sessions.mode.label'),
          value: t('sessions.mode.acceptEdits'),
        }),
      }),
    ).toBeInTheDocument();
  });
});

describe('/ and + in the bar — plan 09, B-12', () => {
  it('writes / at the start of the prompt and opens the commands; there is no "Commands" button — S-26', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(screen.getByRole('button', { name: t('composer.slash.open') }));

    expect(box()).toHaveValue('/');
    expect(box()).toHaveFocus();
    expect(
      await screen.findByRole('listbox', { name: t('composer.slash.label') }),
    ).toBeInTheDocument();

    // Once: a prompt that already starts with / is left as it is.
    await user.click(screen.getByRole('button', { name: t('composer.slash.open') }));
    expect(box()).toHaveValue('/');
  });

  it('puts the / before what is written', async () => {
    const user = userEvent.setup();
    served();
    opened();
    await typeIn(user, box(), 'init');

    await user.click(screen.getByRole('button', { name: t('composer.slash.open') }));

    expect(box()).toHaveValue('/init');
  });

  it('offers a file or a folder, a file of this computer and the selection — each the flow of plan 08 — S-27', async () => {
    const user = userEvent.setup();
    served();
    const selection = mentionProviders.register({
      id: 'test.selection',
      position: 1,
      keyword: 'selection',
      labelKey: 'composer.mention.selection',
      descriptionKey: 'composer.mention.selectionHint',
      items: () => [
        { id: 'r1', kind: 'range', path: 'src/a.ts', startLine: 1, endLine: 2, ...UNCHECKED },
      ],
    });
    const nothing = mentionProviders.register({
      id: 'test.nothing',
      position: 2,
      keyword: 'terminal',
      labelKey: 'composer.mention.selection',
      descriptionKey: 'composer.mention.selectionHint',
      items: () => null,
    });
    try {
      opened();

      // The selection of the editor becomes a chip.
      await user.click(screen.getByRole('button', { name: t('composer.add.open') }));
      const items = await screen.findAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([
        t('composer.add.mention'),
        t('composer.add.computer'),
        `${t('composer.mention.selection')}${t('composer.mention.selectionHint')}`,
        `${t('composer.mention.selection')}${t('composer.add.nothing')}`,
      ]);
      expect(items[3]).toHaveAttribute('aria-disabled', 'true');
      await user.click(items[2] as HTMLElement);
      expect(
        within(screen.getByRole('list', { name: t('composer.set.label') })).getByText(
          'src/a.ts:1-2',
        ),
      ).toBeInTheDocument();

      // A file or a folder: the `@` list, at the cursor.
      await user.click(screen.getByRole('button', { name: t('composer.add.open') }));
      await user.click(await screen.findByRole('menuitem', { name: t('composer.add.mention') }));
      expect(box()).toHaveValue('@');
      expect(
        await screen.findByRole('listbox', { name: t('composer.mention.label') }),
      ).toBeInTheDocument();
    } finally {
      selection();
      nothing();
    }
  });

  it('attaches a file of this computer, as dropping it does', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(screen.getByRole('button', { name: t('composer.add.open') }));
    await user.click(await screen.findByRole('menuitem', { name: t('composer.add.computer') }));
    const input = screen.getByLabelText<HTMLInputElement>(t('composer.add.computer'));
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await user.upload(input, file);

    expect(
      within(screen.getByRole('list', { name: t('composer.set.label') })).getByText('notes.txt'),
    ).toBeInTheDocument();
    // Cleared, so the same file picked again is a second attachment.
    expect(input.value).toBe('');

    // A change that carries no list adds nothing.
    Object.defineProperty(input, 'files', { configurable: true, value: null });
    fireEvent.change(input);
    expect(
      within(screen.getByRole('list', { name: t('composer.set.label') })).getAllByRole('listitem'),
    ).toHaveLength(1);
  });
});

describe('what stops a send, said where it belongs — plan 09, B-14, D-07', () => {
  it('keeps an empty box from sending, saying why in the button only — S-28', async () => {
    served();
    opened();

    const send = await screen.findByRole('button', { name: t('session.composer.send') });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(t('composer.send.empty'));
    expect(screen.getByText(t('composer.send.empty'))).toHaveClass('sr-only');
    expect(send.parentElement).toHaveAttribute('title', t('composer.send.empty'));
  });

  it('cancels a queued prompt once, however often it is clicked — S-31', async () => {
    const user = userEvent.setup();
    served();
    opened();
    for (const [index, queueId] of ['q1', 'q2', 'q3'].entries()) {
      says('prompt.queued', {
        queueId,
        position: index + 1,
        preview: `prompt ${queueId}`,
        promptedBy: 'web',
      });
    }

    const cancel = screen.getByRole('button', {
      name: t('sessions.queue.cancel', { position: 2 }),
    });
    await user.click(cancel);
    await user.click(cancel);

    expect(sent('session.cancelQueuedPrompt')).toHaveLength(1);
    expect(live.lastSent('session.cancelQueuedPrompt')).toMatchObject({
      payload: { sessionId: SESSION, queueId: 'q2' },
    });
  });

  it('says it is editing above the box, and Esc stops editing before it interrupts — S-32', async () => {
    const user = userEvent.setup();
    served();
    opened();
    says('message.completed', {
      messageId: 'u1',
      role: 'user',
      content: [{ type: 'text', text: 'first' }],
    });
    says('session.statusChanged', { status: 'running' });

    await user.click(await screen.findByRole('button', { name: t('sessions.message.edit') }));
    expect(screen.getByText(t('sessions.edit.editing'))).toBeVisible();

    box().focus();
    await user.keyboard('{Escape}');

    expect(screen.queryByText(t('sessions.edit.editing'))).toBeNull();
    expect(sent('session.interrupt')).toHaveLength(0);

    box().focus();
    await user.keyboard('{Escape}');
    expect(sent('session.interrupt')).toHaveLength(1);
  });

  it('shows the refusal of a command the installation lacks above the box, until the next one — plan 04, S-34', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await typeIn(user, box(), '/nope');
    await user.keyboard('{Enter}');
    live.receive(
      aRefusal(
        String(live.lastSent('session.prompt')?.['id']),
        'INVALID_INPUT',
        'session.error.unknownCommand',
        { command: 'nope' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('session.error.unknownCommand', { command: 'nope' }),
    );

    await typeIn(user, box(), 'do the work');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('does not show the refusal of somebody else’s command — plan 04, S-34', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await typeIn(user, box(), '/init');
    await user.keyboard('{Enter}');
    live.receive(aRefusal('another-frame', 'INVALID_INPUT', 'session.error.unknownCommand'));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the context window in the bar — plan 09, B-13', () => {
  it('shows the share used, warns past the threshold, and opens upwards with Compact — S-33', async () => {
    const user = userEvent.setup();
    served();
    opened();

    const ring = await screen.findByRole('button', {
      name: t('sessions.context.label', { percentage: 85 }),
    });
    expect(ring).toHaveClass('text-warning');
    expect(ring).toHaveTextContent(t('sessions.context.percentage', { percentage: 85 }));

    await user.click(ring);
    const popover = await screen.findByRole('menu');
    expect(popover).toHaveAttribute('data-side', 'top');
    expect(within(popover).getByText(t('sessions.context.messages'))).toBeVisible();
    expect(
      within(popover).getByRole('menuitem', { name: t('sessions.context.compact') }),
    ).toBeVisible();
  });

  it('steps aside with the reason, and keeps its place in the bar — S-34', async () => {
    served({ [`/sessions/${SESSION}/context`]: [{ ...agentUnavailable }] });
    opened();

    const away = await screen.findByRole('img', { name: t('sessions.context.unavailable') });
    const bar = screen.getByRole('group', { name: t('sessions.header.label') });
    expect(bar).toContainElement(away);
    expect(barNames().at(-1)).toBe(t('session.composer.send'));
  });
});

/** A context of the given categories, as `GET /sessions/:id/context` answers it. */
function aContext(categories: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { model: 'opus', totalTokens: 1_000, maxTokens: 200_000, percentage: 40, categories };
}

/** The menu of the meter, opened. */
async function meterMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(
    await screen.findByRole('button', { name: t('sessions.context.label', { percentage: 40 }) }),
  );
  return screen.findByRole('menu');
}

describe('the canonical context — plan 28, B-24', () => {
  it('names each canonical category by its key, and any other by the words of the engine — S-71', async () => {
    const user = userEvent.setup();
    const canonical = ['system', 'tools', 'messages', 'memory', 'free', 'reserved'].map((id) => ({
      id,
      messageKey: `sessions.context.${id}`,
      name: `engine name of ${id}`,
      tokens: 10,
      kind: 'used',
    }));
    served({
      [`/sessions/${SESSION}/context`]: [
        aContext([
          ...canonical,
          { id: 'skills', text: 'Skills of the engine', name: 'Skills', tokens: 5, kind: 'used' },
        ]),
      ],
    });
    opened();

    const menu = await meterMenu(user);
    for (const key of [
      'sessions.context.system',
      'sessions.context.tools',
      'sessions.context.messages',
      'sessions.context.memory',
      'sessions.context.free',
      'sessions.context.reserved',
    ]) {
      expect(within(menu).getByText(t(key))).toBeVisible();
    }
    expect(within(menu).getByText('Skills of the engine')).toBeVisible();
    expect(within(menu).queryByText(/engine name of/)).toBeNull();
  });

  it('shows the text, or the id, of a category whose key this build does not know — S-71', async () => {
    const user = userEvent.setup();
    served({
      [`/sessions/${SESSION}/context`]: [
        aContext([
          {
            id: 'a',
            messageKey: 'sessions.context.later',
            text: 'Later',
            name: 'n',
            tokens: 1,
            kind: 'used',
          },
          {
            id: 'deferredTools',
            messageKey: 'sessions.context.x',
            name: 'n',
            tokens: 1,
            kind: 'deferred',
          },
          { id: 'odd', name: 'n', tokens: 1, kind: 'used' },
        ]),
      ],
    });
    opened();

    const menu = await meterMenu(user);
    expect(within(menu).getByText('Later')).toBeVisible();
    expect(within(menu).getByText('deferredTools')).toBeVisible();
    expect(within(menu).getByText('odd')).toBeVisible();
  });

  it('has no meter for an engine that does not say how full its context is — S-72', async () => {
    served();
    opened({ ...CAPABILITIES, contextUse: false });

    await screen.findByRole('button', { name: t('session.composer.send') });
    await waitFor(() => {
      expect(screen.queryByRole('meter')).toBeNull();
    });
    expect(
      screen.queryByRole('button', { name: t('sessions.context.label', { percentage: 85 }) }),
    ).toBeNull();
    expect(screen.queryByRole('img', { name: t('sessions.context.unavailable') })).toBeNull();
  });

  it('says why when the server refuses the context of an engine without it — S-72', async () => {
    served({
      [`/sessions/${SESSION}/context`]: [
        {
          code: 'ENGINE_CAPABILITY_UNAVAILABLE',
          messageKey: 'engine.error.capabilityUnavailable',
          params: { engine: 'claude', capability: 'contextUse' },
          traceId: 'trace-cap',
        },
      ],
    });
    opened();

    const away = await screen.findByRole('img', { name: t('sessions.context.unavailable') });
    expect(away).toBeInTheDocument();
  });
});

describe('compacting the conversation — plan 28, B-23', () => {
  it('sends session.compact for the session, never a prompt — S-69', async () => {
    const user = userEvent.setup();
    served({ [`/sessions/${SESSION}/context`]: [aContext([])] });
    opened();

    const menu = await meterMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.context.compact') }));

    expect(sent('session.compact')).toHaveLength(1);
    expect(sent('session.compact')[0]?.['payload']).toEqual({ sessionId: SESSION });
    expect(sent('session.prompt')).toHaveLength(0);
  });

  it('has no Compact for an engine that does not compact — S-70', async () => {
    const user = userEvent.setup();
    served({ [`/sessions/${SESSION}/context`]: [aContext([])] });
    opened({ ...CAPABILITIES, compaction: false });

    const menu = await meterMenu(user);
    expect(
      within(menu).queryByRole('menuitem', { name: t('sessions.context.compact') }),
    ).toBeNull();
  });

  it('says the refusal of an engine without compaction above the box — S-70', async () => {
    const user = userEvent.setup();
    served({ [`/sessions/${SESSION}/context`]: [aContext([])] });
    opened();

    const menu = await meterMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.context.compact') }));
    live.receive(
      aRefusal(
        String(live.lastSent('session.compact')?.['id']),
        'ENGINE_CAPABILITY_UNAVAILABLE',
        'engine.error.capabilityUnavailable',
        { engine: 'claude', capability: 'compaction' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('engine.error.capabilityUnavailable', { engine: 'claude', capability: 'compaction' }),
    );
  });

  it('still sends a /compact typed in the box as a prompt — the engine reads it', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await typeIn(user, box(), '/compact now');
    await user.keyboard('{Enter}');

    expect(live.lastSent('session.prompt')).toMatchObject({ payload: { text: '/compact now' } });
    expect(sent('session.compact')).toHaveLength(0);
  });
});

describe('the task list above the box — plan 28, B-22', () => {
  const TASKS = [
    { id: 't1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: 'inProgress' },
    { id: 't2', title: 'Write b.txt', status: 'pending' },
  ];

  it('draws the list the session said, live — S-66', async () => {
    served();
    opened();
    says('session.tasksChanged', { tasks: TASKS });

    const region = await screen.findByRole('region', { name: t('sessions.tasks.label') });
    expect(within(region).getByRole('button')).toHaveTextContent(
      t('sessions.tasks.headline', { done: 0, total: 2, task: 'Writing a.txt' }),
    );
  });

  it('has no strip for an engine that keeps no list — S-68', async () => {
    served();
    opened({ ...CAPABILITIES, taskList: false });
    says('session.tasksChanged', { tasks: TASKS });

    await screen.findByRole('button', { name: t('session.composer.send') });
    expect(screen.queryByRole('region', { name: t('sessions.tasks.label') })).toBeNull();
  });
});

describe('the keyboard of the bar — plan 09, B-15', () => {
  it('opens a chip with Enter and walks its menu with the arrows', async () => {
    const user = userEvent.setup();
    served();
    opened();

    chip(t('sessions.mode.label'), t('sessions.mode.ask')).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(live.lastSent('session.setPermissionMode')).toBeDefined();
  });

  it('keeps the focus in the box when a menu item hands it there', async () => {
    const user = userEvent.setup();
    served();
    opened();

    await user.click(screen.getByRole('button', { name: t('composer.add.open') }));
    await user.click(await screen.findByRole('menuitem', { name: t('composer.add.mention') }));

    await waitFor(() => {
      expect(box()).toHaveFocus();
    });
  });
});
