import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, registerClaudeContext, SessionScreen } from '@/features/session';
import { DraftView } from '@/features/session/components/panel/DraftView';
import { PanelHelp } from '@/features/session/components/panel/PanelHelp';
import { mentionProviders } from '@/features/session/lib/mention-providers';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { editorStoreOf, forgetEditor } from '@/features/editor/store/editor.store';
import { forgetFolderTabs } from '@/features/workbench';
import { useKnownModels } from '@/features/session/store/known-models.store';
import { api } from '@/shared/api/api';
import { wsClient } from '@/shared/api/ws';
import { AppError } from '@/shared/api/errors';
import { addToClaudeContext, FILES_DRAG_TYPE } from '@/shared/lib/files-drag';
import { aHistoryPage } from '../../../support/history';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { typeIn } from '../../../support/workbench';
import { aRefusal, routeApi, SESSION } from '../../../support/session-tools';

const t = translator('en');
const A = '/srv/projects/app';
const CONVERSATION = 'conv-1';
const KEY = `session:${SESSION}`;

let live: LiveSocket;
let seq = 1;
let unregister: () => void;

/** The tree of the folder, by level, as `GET /files/tree` answers. */
const TREE: Record<string, unknown> = {
  '': {
    path: '',
    truncated: false,
    entries: [
      { path: 'README.md', name: 'README.md', kind: 'file' },
      { path: 'src', name: 'src', kind: 'directory' },
      { path: 'link', name: 'link', kind: 'symlink', outside: true },
    ],
  },
  src: {
    path: 'src',
    truncated: true,
    entries: [
      { path: 'src/app.ts', name: 'app.ts', kind: 'file' },
      { path: 'src/composer.ts', name: 'composer.ts', kind: 'file' },
    ],
  },
};

const COMMANDS = {
  cliVersion: '2.1.277',
  commands: [
    {
      name: 'review',
      origin: 'builtin',
      label: 'review',
      description: 'Review the changes',
      argumentHint: '[pr]',
      suggested: true,
    },
    {
      name: 'review',
      origin: 'project',
      label: 'review',
      description: "The project's",
      shadowed: true,
    },
    { name: 'remote-claude-user:notes', origin: 'user', label: 'notes', description: 'Take notes' },
    { name: 'remote-claude-system:pdf', origin: 'system', label: 'pdf', description: 'Read a PDF' },
  ],
};

/** The reads of the server: the header of the session, the tree, the commands — each overridable. */
function served(extra: Record<string, readonly unknown[]> = {}) {
  return routeApi({
    [`/sessions/${SESSION}/models`]: [{ current: 'opus', models: [] }],
    [`/sessions/${SESSION}/context`]: [
      { model: 'opus', totalTokens: 1_000, maxTokens: 201_000, percentage: 1, categories: [] },
    ],
    [`/sessions/${SESSION}/mcp-servers`]: [{ servers: [] }],
    [`/sessions/${SESSION}/checkpoints`]: [{ checkpoints: [] }],
    [`/sessions/${SESSION}/commands`]: [COMMANDS],
    [`/transcripts/${CONVERSATION}/messages`]: [aHistoryPage([])],
    [`/files/tree?folder=${encodeURIComponent(A)}&path=`]: [TREE['']],
    [`/files/tree?folder=${encodeURIComponent(A)}&path=src`]: [TREE['src']],
    ...extra,
  });
}

/** Every file of the folder, as a probe of its first byte answers — text of the size given. */
function files(sizes: Record<string, number | 'gone' | 'binary'> = {}) {
  return vi.spyOn(api, 'bytes').mockImplementation((path: string) => {
    const file = new URLSearchParams(path.split('?')[1]).get('path') ?? '';
    const size = sizes[file] ?? 100;

    if (size === 'gone') {
      return Promise.reject(new AppError('FILE_NOT_FOUND', 'files.error.notFound', 'trace'));
    }

    return Promise.resolve({
      status: 206,
      blob: new Blob(['x']),
      header: (name: string) =>
        name === 'content-type'
          ? size === 'binary'
            ? 'application/octet-stream'
            : 'text/plain; charset=utf-8'
          : `bytes 0-0/${String(size === 'binary' ? 50 : size)}`,
    });
  });
}

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
  seq = 1;
  unregister = registerClaudeContext();
});

afterEach(() => {
  unregister();
  live.close();
  forgetClaudePanel(null);
  forgetFolderTabs();
  forgetEditor(A);
  vi.restoreAllMocks();
});

function says(type: string, payload: Record<string, unknown>): void {
  seq += 1;
  live.receive(hubEvent(SESSION, type, seq, payload));
}

/** The screen of a session of the panel, connected, on its conversation. */
function opened(): ReturnType<typeof render> {
  claudePanelStore(A).getState().show('session', SESSION);
  const mounted = render(<SessionScreen sessionId={SESSION} folder={A} />);
  live.connect();
  live.receive(
    hubEvent(SESSION, 'session.started', 1, {
      sessionId: SESSION,
      claudeSessionId: CONVERSATION,
      workspacePath: A,
      model: 'opus',
      permissionMode: 'default',
    }),
  );
  return mounted;
}

const box = (): HTMLTextAreaElement => screen.getByLabelText(t('composer.box.label'));
const send = (): HTMLElement => screen.getByRole('button', { name: t('session.composer.send') });
const chips = (): HTMLElement => screen.getByRole('list', { name: t('composer.set.label') });
const chipNames = (): string[] =>
  within(chips())
    .queryAllByRole('listitem')
    .map((chip) => chip.querySelector('.font-mono')?.textContent ?? '');

describe('the composer — plan 08, B-46', () => {
  it('sends with Enter, breaks the line with Shift+Enter, and sends nothing while an input method composes — S-214', async () => {
    served();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), 'first line');
    await user.keyboard('{Shift>}{Enter}{/Shift}second');
    expect(box().value).toBe('first line\nsecond');

    fireEvent.compositionStart(box());
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.compositionEnd(box());
    expect(live.lastSent('session.prompt')).toBeUndefined();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { sessionId: SESSION, text: 'first line\nsecond' },
      });
    });
    expect(box().value).toBe('');
  });

  it('keeps the button off with nothing to send, and says why — and the context alone sends — S-215', async () => {
    served();
    files();
    opened();

    expect(send()).toBeDisabled();
    expect(send()).toHaveAccessibleDescription(t('composer.send.empty'));

    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });
    await waitFor(() => {
      expect(send()).toBeEnabled();
    });
    fireEvent.click(send());

    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { text: '', attachments: [{ kind: 'file', path: `${A}/README.md` }] },
      });
    });
  });

  it('gives the text and the context back, with the refusal translated — S-216, S-222', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });

    await typeIn(user, box(), 'explain it');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toBeDefined();
    });
    expect(screen.queryByRole('list', { name: t('composer.set.label') })).not.toBeInTheDocument();

    live.receive(
      aRefusal(
        String(live.lastSent('session.prompt')?.['id']),
        'WORKSPACE_NOT_ALLOWED',
        'workspace.error.notAllowed',
        {
          path: `${A}/README.md`,
        },
      ),
    );

    expect(
      await screen.findByText(t('workspace.error.notAllowed', { path: `${A}/README.md` })),
    ).toBeInTheDocument();
    expect(box().value).toBe('explain it');
    expect(chipNames()).toEqual(['README.md']);
  });

  it('says a prompt sent during a turn waits in the queue — S-217, S-238', async () => {
    served();
    files();
    opened();
    says('session.statusChanged', { status: 'thinking' });

    // Nothing to send: the button is stop (plan 09, D-06).
    expect(
      await screen.findByRole('button', { name: t('composer.send.stop') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('composer.send.queue') })).toBeNull();

    // A drop during the turn goes into the context of the next prompt, which queues — and says so.
    drop(screen.getByLabelText(t('composer.box.label')).closest('form') as HTMLElement, {
      folder: A,
      entries: [{ path: 'src', kind: 'directory' }],
    });
    expect(chipNames()).toEqual(['src']);
    expect(
      screen.getByRole('button', { name: t('composer.send.queue') }),
    ).toHaveAccessibleDescription(t('composer.send.queued'));
    expect(screen.getByRole('button', { name: t('composer.send.stop') })).toBeInTheDocument();
  });
});

/** A drag of entries, as the tree and the tabs write it. */
function drop(target: HTMLElement, payload: Record<string, unknown>, files: File[] = []): void {
  const types = files.length > 0 ? ['Files'] : [FILES_DRAG_TYPE, 'text/plain'];
  const dataTransfer = {
    types,
    files,
    dropEffect: 'none',
    getData: (format: string) =>
      format === FILES_DRAG_TYPE && files.length === 0 ? JSON.stringify(payload) : '',
  };
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe('the set of context — plan 08, B-47', () => {
  it('shows a chip of each kind, removable by click and by keyboard — S-218', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();

    act(() => {
      addToClaudeContext({
        folder: A,
        entries: [
          { path: 'README.md', kind: 'file' },
          { path: 'src', kind: 'directory' },
        ],
        selection: {
          path: 'src/app.ts',
          range: { startLine: 3, startColumn: 1, endLine: 9, endColumn: 2 },
        },
      });
      claudePanelStore(A)
        .getState()
        .setContext(KEY, [
          ...(claudePanelStore(A).getState().contexts[KEY] ?? []),
          {
            id: 'u',
            kind: 'upload',
            name: 'shot.png',
            mediaType: 'image/png',
            size: 9,
            uploadKind: 'image',
            attachmentId: 'att_1',
            error: null,
          },
          { id: 't', kind: 'text', source: 'terminal', label: 'terminal: bash', content: '$ ls' },
        ]);
    });

    expect(chipNames()).toEqual([
      'README.md',
      'src',
      'src/app.ts:3-9',
      'shot.png',
      'terminal: bash',
    ]);

    await user.click(
      screen.getByRole('button', { name: t('composer.chip.remove', { name: 'src' }) }),
    );
    screen.getByRole('button', { name: t('composer.chip.remove', { name: 'shot.png' }) }).focus();
    await user.keyboard('{Enter}');

    expect(chipNames()).toEqual(['README.md', 'src/app.ts:3-9', 'terminal: bash']);
  });

  it('adds up the set as an estimate, warns past the share of the window, and refuses past the ceiling — S-219', async () => {
    served();
    files({ 'README.md': 40_000, 'notes.md': 400_000, 'big.log': 9_000_000 });
    opened();

    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });
    expect(await screen.findByText(/≈ 10,000 tokens/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(t('composer.set.warn')))).not.toBeInTheDocument();

    // Past a quarter of the 200,000 tokens left: it warns, and still sends.
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'notes.md', kind: 'file' }] });
    });
    expect(await screen.findByText(new RegExp(t('composer.set.warn')))).toBeInTheDocument();
    expect(send()).toBeEnabled();

    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'big.log', kind: 'file' }] });
    });
    await waitFor(() => {
      expect(send()).toBeDisabled();
    });
    expect(send()).toHaveAccessibleDescription(t('composer.set.overBytes'));
  });

  it('keeps one chip for a file chosen twice, and none for a range of a file already whole — S-220', async () => {
    served();
    files();
    opened();

    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
      addToClaudeContext({
        folder: A,
        entries: [],
        selection: {
          path: 'README.md',
          range: { startLine: 1, startColumn: 1, endLine: 2, endColumn: 1 },
        },
      });
    });

    expect(chipNames()).toEqual(['README.md']);
  });

  it('keeps the set of the conversation when its screen leaves and comes back — S-221, S-225', () => {
    served();
    files();
    const mounted = opened();
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });

    mounted.unmount();
    render(<SessionScreen sessionId={SESSION} folder={A} />);

    expect(chipNames()).toEqual(['README.md']);
    // The draft of the same folder tab has a set of its own.
    expect(
      claudePanelStore(A).getState().contexts[claudePanelStore(A).getState().openDraft()],
    ).toBeUndefined();
  });

  it('marks a file gone since it was chosen, and does not send, with its path — S-223', async () => {
    served();
    const probe = files();
    const user = userEvent.setup();
    opened();
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });
    await waitFor(() => {
      expect(probe).toHaveBeenCalled();
    });

    files({ 'README.md': 'gone' });
    await typeIn(user, box(), 'go');
    await user.keyboard('{Enter}');

    expect(
      await screen.findAllByText(t('composer.send.missing', { path: 'README.md' })),
    ).not.toHaveLength(0);
    expect(screen.getByText(t('composer.chip.missing'))).toBeInTheDocument();
    expect(live.lastSent('session.prompt')).toBeUndefined();
    expect(box().value).toBe('go');
  });

  it('leaves a chip unchecked when the file could not be read, and still sends it', async () => {
    served();
    vi.spyOn(api, 'bytes').mockRejectedValue(
      new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't'),
    );
    const user = userEvent.setup();
    opened();
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });

    expect(chipNames()).toEqual(['README.md']);
    await typeIn(user, box(), 'go');
    await user.keyboard('{Enter}');

    // Checked again on the send, it still could not be read: the backend checks it, and decides.
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { text: 'go', attachments: [{ kind: 'file', path: `${A}/README.md` }] },
      });
    });
  });

  it('gives the text and the context back when the socket is down — nothing is lost', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();
    const issue = wsClient.issue.bind(wsClient);
    vi.spyOn(wsClient, 'issue').mockImplementation((type, payload) =>
      type === 'session.prompt' ? null : issue(type, payload),
    );
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'README.md', kind: 'file' }] });
    });

    await typeIn(user, box(), 'later');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(box().value).toBe('later');
    });
    expect(chipNames()).toEqual(['README.md']);
  });

  it('warns on the chip that a binary is not read as text — S-224', async () => {
    served();
    files({ 'logo.bin': 'binary' });
    opened();

    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'logo.bin', kind: 'file' }] });
    });

    expect(await screen.findByText(t('composer.chip.binary'))).toBeInTheDocument();
  });
});

describe('`@` — plan 08, B-48', () => {
  it('lists the folder by level, the open and recent files first, and `@selection` — S-226', async () => {
    served();
    files();
    const user = userEvent.setup();
    editorStoreOf(A).setState({ recent: ['src/composer.ts'] });
    const unregisterProvider = mentionProviders.register({
      id: 'test.selection',
      position: 1,
      keyword: 'selected',
      labelKey: 'composer.mention.selection',
      descriptionKey: 'composer.mention.selectionHint',
      items: () => [
        {
          id: 'r',
          kind: 'range',
          path: 'src/app.ts',
          startLine: 1,
          endLine: 2,
          size: null,
          binary: false,
          missing: false,
        },
      ],
    });
    opened();

    await typeIn(user, box(), 'look @');
    const menu = await screen.findByRole('listbox', { name: t('composer.mention.label') });

    await waitFor(() => {
      expect(
        within(menu)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        expect.stringContaining('@selected'),
        expect.stringContaining('src/composer.ts'),
        expect.stringContaining('README.md'),
        expect.stringContaining('src'),
      ]);
    });
    expect(within(menu).queryByText('link')).not.toBeInTheDocument();

    await typeIn(user, box(), 'src/co');
    await waitFor(() => {
      expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent(
        'src/composer.ts',
      );
    });
    expect(screen.getByText(t('composer.mention.truncated'))).toBeInTheDocument();
    unregisterProvider();
  });

  it('moves with the arrows, chooses with Enter and Tab, and closes with Esc keeping the text — S-227', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), 'see @');
    await screen.findByRole('listbox');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    });
    await user.keyboard('{ArrowDown}');
    expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id);
    await user.keyboard('{Tab}');

    expect(chipNames()).toEqual(['src']);
    expect(box().value).toBe('see ');

    await typeIn(user, box(), '@REA');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('README.md');
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box().value).toBe('see @REA');

    await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}@REA');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('README.md');
    });
    await user.keyboard('{Enter}');
    expect(chipNames()).toEqual(['src', 'README.md']);
    expect(live.lastSent('session.prompt')).toBeUndefined();
  });

  it('shows the answer of the level asked now, never a late one of an older level — S-228', async () => {
    let release: (value: unknown) => void = () => undefined;
    const late = new Promise((resolve) => {
      release = resolve;
    });
    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.endsWith('path=')) return late;
      if (path.endsWith('path=src')) return Promise.resolve(TREE['src']);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    files();
    const user = userEvent.setup();
    render(<SessionScreen sessionId={SESSION} folder={A} />);

    await typeIn(user, box(), '@src/');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('src/app.ts');
    });
    await act(async () => {
      release(TREE['']);
      await late;
    });

    expect(screen.getAllByRole('option').map((option) => option.textContent)).not.toContainEqual(
      expect.stringContaining('README.md'),
    );
  });

  it('finds a name by its letters in order, after the ones that start or hold what was typed', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '@src/cs');

    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('src/composer.ts');
    });
  });

  it('says when nothing matches — S-229', async () => {
    served();
    files();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '@zzz');

    expect(await screen.findByText(t('composer.mention.noMatch'))).toBeInTheDocument();
  });

  it('says when the folder is empty — S-229', async () => {
    served({
      [`/files/tree?folder=${encodeURIComponent(A)}&path=`]: [
        { path: '', truncated: false, entries: [] },
      ],
    });
    files();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '@');

    expect(await screen.findByText(t('composer.mention.emptyFolder'))).toBeInTheDocument();
  });

  it('never offers a path out of the folder; typed and chosen, the send is refused — S-230', async () => {
    served();
    files({ '../secret': 100 });
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), 'x @../secret');
    expect(await screen.findByText(t('composer.mention.outside'))).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(chipNames()).toEqual(['../secret']);

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { attachments: [{ kind: 'file', path: `${A}/../secret` }] },
      });
    });
    live.receive(
      aRefusal(
        String(live.lastSent('session.prompt')?.['id']),
        'WORKSPACE_NOT_ALLOWED',
        'workspace.error.notAllowed',
        {
          path: '/srv/projects/secret',
        },
      ),
    );
    expect(
      await screen.findByText(t('workspace.error.notAllowed', { path: '/srv/projects/secret' })),
    ).toBeInTheDocument();
  });

  it('says the search failed, and still lets the typed path be chosen — S-232', async () => {
    served({
      [`/files/tree?folder=${encodeURIComponent(A)}&path=`]: [
        {
          code: 'NETWORK_UNREACHABLE',
          messageKey: 'common.error.offline',
          params: {},
          traceId: 't',
        },
      ],
    });
    files();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '@notes.md');
    expect(await screen.findByText(t('composer.mention.failed'))).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(chipNames()).toEqual(['notes.md']);
  });
});

describe('dragging into the context — plan 08, B-49', () => {
  it('makes chips of what the tree or a tab drags, a folder as one, and announces where to drop — S-233, S-234, S-235, S-240', async () => {
    served();
    files();
    opened();
    const zone = box().closest('form') as HTMLElement;

    fireEvent.dragOver(zone, { dataTransfer: { types: [FILES_DRAG_TYPE], getData: () => '' } });
    expect(screen.getByText(t('composer.drop.here'))).toBeInTheDocument();

    drop(zone, {
      folder: A,
      entries: [
        { path: 'README.md', kind: 'file' },
        { path: 'node_modules', kind: 'directory' },
      ],
    });
    drop(zone, { folder: A, entries: [{ path: 'src/app.ts', kind: 'file' }] });

    expect(chipNames()).toEqual(['README.md', 'node_modules', 'src/app.ts']);
    expect(screen.queryByText(t('composer.drop.here'))).not.toBeInTheDocument();
  });

  it('stops announcing when the drag leaves, and lets go of what it does not take', () => {
    served();
    files();
    opened();
    const zone = box().closest('form') as HTMLElement;

    fireEvent.dragOver(zone, { dataTransfer: { types: [FILES_DRAG_TYPE], getData: () => '' } });
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(screen.queryByText(t('composer.drop.here'))).not.toBeInTheDocument();

    const link = { types: ['text/uri-list'], files: [], getData: () => 'https://x' };
    fireEvent.dragOver(zone, { dataTransfer: link });
    fireEvent.drop(zone, { dataTransfer: link });
    expect(screen.queryByText(t('composer.drop.here'))).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: t('composer.set.label') })).not.toBeInTheDocument();
  });

  it('takes the same file of the desktop once, and sends it once', async () => {
    served();
    files();
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({
      status: 201,
      body: { attachmentId: 'att_1', kind: 'text', mediaType: 'text/plain', size: 2 },
    });
    opened();
    const zone = box().closest('form') as HTMLElement;

    drop(zone, {}, [new File(['hi'], 'n.txt', { type: 'text/plain' })]);
    drop(zone, {}, [new File(['hi'], 'n.txt', { type: 'text/plain' })]);

    expect(chipNames()).toEqual(['n.txt']);
    await waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses what another folder tab drags, and says why — S-239', () => {
    served();
    files();
    opened();

    drop(box().closest('form') as HTMLElement, {
      folder: '/srv/projects/other',
      entries: [{ path: 'x.ts', kind: 'file' }],
    });

    expect(screen.getByText(t('composer.drop.otherFolder', { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: t('composer.set.label') })).not.toBeInTheDocument();
  });

  it('sends a file of the desktop to the session as an attachment, and nothing to the folder — S-236', async () => {
    served();
    files();
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({
      status: 201,
      body: { attachmentId: 'att_9', kind: 'image', mediaType: 'image/png', size: 4 },
    });
    const post = vi.spyOn(api, 'post');
    const user = userEvent.setup();
    opened();

    drop(box().closest('form') as HTMLElement, {}, [
      new File([new Uint8Array(4)], 'shot.png', { type: 'image/png' }),
    ]);
    await waitFor(() => {
      expect(screen.queryByText(t('composer.chip.pending'))).not.toBeInTheDocument();
    });
    await typeIn(user, box(), 'what is it');
    await user.keyboard('{Enter}');

    expect(upload.mock.calls[0]?.[0]).toBe(`/sessions/${SESSION}/attachments`);
    expect(post).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { attachments: [{ kind: 'upload', attachmentId: 'att_9' }] },
      });
    });
  });

  it('refuses before anything leaves a file past the ceiling or of a type the prompt does not carry — S-237', () => {
    served();
    files();
    const upload = vi.spyOn(api, 'upload');
    opened();
    const zone = box().closest('form') as HTMLElement;

    drop(zone, {}, [
      new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' }),
    ]);
    expect(
      screen.getByText(t('composer.drop.tooLarge', { name: 'huge.png', limit: 5 })),
    ).toBeInTheDocument();
    drop(zone, {}, [new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })]);
    expect(
      screen.getByText(
        t('composer.drop.unsupported', { name: 'doc.pdf', type: 'application/pdf' }),
      ),
    ).toBeInTheDocument();

    expect(upload).not.toHaveBeenCalled();
  });

  it('marks an attachment the server refused, and does not send until it is removed', async () => {
    served();
    files();
    vi.spyOn(api, 'upload').mockRejectedValue(
      new AppError('ATTACHMENT_TYPE_UNSUPPORTED', 'session.error.attachmentTypeUnsupported', 't', {
        mediaType: 'image/svg+xml',
      }),
    );
    opened();

    drop(box().closest('form') as HTMLElement, {}, [
      new File(['<svg/>'], 'x.txt', { type: 'text/plain' }),
    ]);

    expect(
      await screen.findByText(
        t('session.error.attachmentTypeUnsupported', { mediaType: 'image/svg+xml' }),
      ),
    ).toBeInTheDocument();
    expect(send()).toBeDisabled();
  });
});

describe('`/` — plan 08, B-50', () => {
  it('lists the commands and skills of the session with their origin, the covered one said — S-241, S-242, S-243', async () => {
    served();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '/');
    const menu = await screen.findByRole('listbox', { name: t('composer.slash.label') });

    await waitFor(() => {
      expect(within(menu).getAllByRole('option')).toHaveLength(4);
    });
    const rows = within(menu)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(rows[0]).toContain(t('composer.origin.builtin'));
    expect(rows[1]).toContain(t('composer.origin.project'));
    expect(rows[1]).toContain(t('composer.slash.shadowed'));
    expect(rows[2]).toContain('/notes');
    expect(rows[2]).toContain(t('composer.origin.user'));
    expect(rows[3]).toContain(t('composer.origin.system'));
  });

  it('filters while typing, and inserts the name the CLI runs with its hint — S-242, S-247, S-248', async () => {
    served();
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '/not');
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
    await user.keyboard('{Enter}');
    expect(box().value).toBe('/remote-claude-user:notes ');

    await user.clear(box());
    await typeIn(user, box(), '/rev');
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    await user.keyboard('{Enter}');
    expect(box().value).toBe('/review ');
    expect(
      screen.getByText(t('composer.slash.argumentHint', { hint: '[pr]' })),
    ).toBeInTheDocument();
  });

  it('goes on without the list, and sends `/name` as typed — S-246', async () => {
    served({
      [`/sessions/${SESSION}/commands`]: [
        {
          code: 'CLAUDE_UNAVAILABLE',
          messageKey: 'session.error.claudeUnavailable',
          params: {},
          traceId: 't',
        },
      ],
    });
    const user = userEvent.setup();
    opened();

    await typeIn(user, box(), '/deploy');
    expect(await screen.findByText(t('composer.slash.unavailable'))).toBeInTheDocument();
    await user.keyboard(' now{Enter}');

    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({ payload: { text: '/deploy now' } });
    });
  });
});

describe('a draft — plan 08, B-45, B-50, D-13', () => {
  /** A draft of the panel, on screen. */
  function aDraft(): string {
    const key = claudePanelStore(A).getState().openDraft();
    render(<DraftView folder={A} tabKey={key} />);
    live.connect();
    return key;
  }

  it('reads the menu from the catalogue of the folder, once for two drafts — S-244, S-245', async () => {
    const get = served({
      [`/catalog?workspacePath=${encodeURIComponent(A)}`]: [
        { ...COMMANDS, models: [], limits: {} },
      ],
    });
    const user = userEvent.setup();
    const first = claudePanelStore(A).getState().openDraft();
    const second = claudePanelStore(A).getState().openDraft();
    render(
      <>
        <DraftView folder={A} tabKey={first} />
        <DraftView folder={A} tabKey={second} />
      </>,
    );
    live.connect();

    const [one, other] = screen.getAllByLabelText(t('composer.box.label'));
    await typeIn(user, one as HTMLElement, '/');
    await typeIn(user, other as HTMLElement, '/');
    await waitFor(() => {
      expect(screen.getAllByRole('listbox')).toHaveLength(2);
    });

    expect(get.mock.calls.filter(([path]) => path.startsWith('/catalog'))).toHaveLength(1);
  });

  it('holds a file of the desktop until the session exists, then sends it with the first prompt — S-236', async () => {
    served();
    files();
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({
      status: 201,
      body: { attachmentId: 'att_7', kind: 'text', mediaType: 'text/plain', size: 5 },
    });
    const user = userEvent.setup();
    aDraft();

    drop(box().closest('form') as HTMLElement, {}, [
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    ]);
    expect(chipNames()).toEqual(['notes.txt']);
    expect(upload).not.toHaveBeenCalled();

    await typeIn(user, box(), 'read it');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.start')).toBeDefined();
    });
    live.receive({
      v: 1,
      id: 'started',
      kind: 'event',
      type: 'session.started',
      ts: '2026-10-02T12:00:00.000Z',
      seq: 1,
      correlationId: live.lastSent('session.start')?.['id'],
      payload: { sessionId: SESSION, workspacePath: A },
    });

    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: {
          sessionId: SESSION,
          text: 'read it',
          attachments: [{ kind: 'upload', attachmentId: 'att_7' }],
        },
      });
    });
    expect(upload.mock.calls[0]?.[0]).toBe(`/sessions/${SESSION}/attachments`);
  });

  /** The `session.started` that answers the start of the draft. */
  function started(): void {
    live.receive({
      v: 1,
      id: 'started',
      kind: 'event',
      type: 'session.started',
      ts: '2026-10-02T12:00:00.000Z',
      seq: 1,
      correlationId: live.lastSent('session.start')?.['id'],
      payload: { sessionId: SESSION, workspacePath: A },
    });
  }

  it('offers the models of the catalogue in the draft once it was read — D-13', async () => {
    served({
      [`/catalog?workspacePath=${encodeURIComponent(A)}`]: [
        {
          ...COMMANDS,
          models: [{ value: 'opus', displayName: 'Opus', description: '' }],
          limits: {},
        },
      ],
    });
    const user = userEvent.setup();
    aDraft();

    await typeIn(user, box(), '/');

    await waitFor(() => {
      expect(useKnownModels.getState().byFolder[A]?.map((model) => model.value)).toEqual(['opus']);
    });
  });

  it('gives the text and the set back to the session when an attachment is refused on the way — S-237', async () => {
    served();
    files();
    vi.spyOn(api, 'upload').mockRejectedValue(
      new AppError('PAYLOAD_TOO_LARGE', 'session.error.attachmentTooLarge', 't', { limit: 5 }),
    );
    const user = userEvent.setup();
    aDraft();
    drop(box().closest('form') as HTMLElement, {}, [
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    ]);

    await typeIn(user, box(), 'read it');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.start')).toBeDefined();
    });
    started();

    await waitFor(() => {
      expect(claudePanelStore(A).getState().drafts[KEY]).toBe('read it');
    });
    expect(claudePanelStore(A).getState().contexts[KEY]?.[0]).toMatchObject({
      name: 'notes.txt',
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect(live.lastSent('session.prompt')).toBeUndefined();
  });

  it('gives the first prompt back to the session when the socket drops before it leaves', async () => {
    served();
    files();
    const user = userEvent.setup();
    aDraft();
    const issue = wsClient.issue.bind(wsClient);
    vi.spyOn(wsClient, 'issue').mockImplementation((type, payload) =>
      type === 'session.prompt' ? null : issue(type, payload),
    );

    await typeIn(user, box(), 'first');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(live.lastSent('session.start')).toBeDefined();
    });
    started();

    await waitFor(() => {
      expect(claudePanelStore(A).getState().drafts[KEY]).toBe('first');
    });
  });

  it('keeps the draft as it is when a file of its context is gone — S-223', async () => {
    served();
    const probe = files();
    const user = userEvent.setup();
    aDraft();
    act(() => {
      addToClaudeContext({ folder: A, entries: [{ path: 'gone.md', kind: 'file' }] });
    });
    await waitFor(() => {
      expect(probe).toHaveBeenCalled();
    });
    files({ 'gone.md': 'gone' });

    await typeIn(user, box(), 'go');
    await user.keyboard('{Enter}');

    expect(
      await screen.findAllByText(t('composer.send.missing', { path: 'gone.md' })),
    ).not.toHaveLength(0);
    expect(live.lastSent('session.start')).toBeUndefined();
  });
});

describe('from the editor — plan 08, B-51', () => {
  it('puts a selection in the conversation on screen of the same tab, and warns of an unsaved buffer — S-249, S-250', async () => {
    served();
    files();
    opened();
    editorStoreOf(A).setState({
      docs: {
        'src/app.ts': {
          path: 'src/app.ts',
          model: { dispose: () => undefined },
          version: 2,
          savedVersion: 1,
        } as never,
      },
    });

    act(() => {
      addToClaudeContext({
        folder: A,
        entries: [],
        selection: {
          path: 'src/app.ts',
          range: { startLine: 4, startColumn: 1, endLine: 6, endColumn: 3 },
        },
      });
    });

    expect(chipNames()).toEqual(['src/app.ts:4-6']);
    expect(screen.getByText(t('composer.chip.dirty'))).toBeInTheDocument();
  });

  it('adds one chip per cursor, and the whole file for an empty selection — S-251', () => {
    served();
    files();
    opened();
    const range = (line: number) => ({
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 2,
    });

    act(() => {
      addToClaudeContext({ folder: A, entries: [], selection: { path: 'a.ts', range: range(1) } });
      addToClaudeContext({ folder: A, entries: [], selection: { path: 'a.ts', range: range(5) } });
      addToClaudeContext({ folder: A, entries: [{ path: 'b.ts', kind: 'file' }] });
    });

    expect(chipNames()).toEqual(['a.ts:1-1', 'a.ts:5-5', 'b.ts']);
  });
});

describe('help and keyboard — plan 08, B-52', () => {
  it.each(['en', 'pt-BR'] as const)(
    'explains @, /, dragging, the set, what Claude reads and the desktop, in %s — S-252',
    (locale) => {
      const say = translator(locale);
      render(<PanelHelp open onOpenChange={() => undefined} />, locale);

      for (const topic of [
        'mention',
        'commands',
        'drag',
        'contextSet',
        'reads',
        'desktop',
        'skills',
      ]) {
        expect(screen.getByText(say(`claudePanel.help.${topic}Heading`))).toBeInTheDocument();
        expect(screen.getByText(say(`claudePanel.help.${topic}`))).toBeInTheDocument();
      }
    },
  );

  it('works by keyboard alone — open @ and /, choose, remove a chip, send — with no axe violation — S-253', async () => {
    served();
    files();
    const user = userEvent.setup();
    const { container } = opened();

    await typeIn(user, box(), '@README');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('README.md');
    });
    expect(await axe(container)).toHaveNoViolations();
    await user.keyboard('{Enter}');
    // The chips are above the box: back one stop is the way to remove the last of them.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: t('composer.chip.remove', { name: 'README.md' }) }),
    );
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('list', { name: t('composer.set.label') })).not.toBeInTheDocument();

    box().focus();
    await user.keyboard('/rev');
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    await user.keyboard('{Enter}explain{Enter}');

    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { text: '/review explain' },
      });
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
