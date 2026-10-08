import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { Envelope } from '@remote-claude/contracts';

import { Conversation } from '@/features/session/components/Conversation';
import { OUTPUT_CEILING } from '@/features/session/components/conversation/AnsiText';
import { readEvent, SILENT } from '@/features/session/services/conversation-reducer';
import type { Conversation as ConversationState } from '@/features/session/types/live-session';
import { setEngineLoader } from '@/features/editor/lib/engine-loader';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import { showView } from '@/features/editor/hooks/views';
import type { CodeEditorEngine, CodeView, TextPosition } from '@/features/editor/types/code-editor';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { FOLDER, editorState, openedModel } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { renderRouted, translator } from '../../../support/render';

const t = translator('en');
const T0 = '2026-09-19T12:00:00.000Z';
const SLOW = { timeout: 5_000 };

function frame(type: string, payload: Record<string, unknown>, ts = T0): Envelope {
  return { v: 1, id: `f-${type}`, kind: 'event', type, ts, payload } as Envelope;
}

function said(messageId: string, text: string, extra: Record<string, unknown> = {}): Envelope {
  return frame('message.completed', {
    messageId,
    role: 'assistant',
    content: [{ type: 'text', text }],
    ...extra,
  });
}

function fold(...frames: readonly Envelope[]): ConversationState {
  return frames.reduce(readEvent, SILENT);
}

function show(
  conversation: ConversationState,
  props: { conversationId?: string; onSearchEverything?: () => void } = {},
) {
  return renderRouted(
    <Conversation
      conversation={conversation}
      isPartial={false}
      folder={FOLDER}
      sessionId="s-1"
      conversationId={props.conversationId ?? null}
      {...(props.onSearchEverything === undefined
        ? {}
        : { onSearchEverything: props.onSearchEverything })}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setEngineLoader('monaco', () => Promise.resolve(createPlainEngine()));
});

/** The engine of the editor, colouring code as a test says it does. */
function colouringWith(colorize: NonNullable<CodeEditorEngine['colorize']>): void {
  setEngineLoader('monaco', () => Promise.resolve({ ...createPlainEngine(), colorize }));
}

/**
 * The panel's conversation (plan 08, F2), through the screen: Claude's markdown, safely; code with
 * its buttons; the names of files as links; thinking folded; tools as one line; subagents nested
 * under their tool; the end of each turn; and the search.
 */
describe('the conversation of the panel', () => {
  describe('the markdown of an answer — B-14', () => {
    it('renders headings, lists, tables, quotes and code — S-58', async () => {
      show(
        fold(
          said(
            'm1',
            '# Title\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quoted\n\nuse `x`',
          ),
        ),
      );

      expect(await screen.findByRole('heading', { name: 'Title' }, SLOW)).toBeInTheDocument();
      expect(screen.getAllByRole('listitem').some((item) => item.textContent === 'one')).toBe(true);
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('quoted').closest('blockquote')).not.toBeNull();
      expect(screen.getByText('x').tagName).toBe('CODE');
    });

    it('shows raw HTML as text, never as an element — S-59', async () => {
      const { container } = show(
        fold(
          said(
            'm1',
            'a <img src=x onerror="alert(1)"> <script>alert(2)</script> <iframe></iframe> b',
          ),
        ),
      );

      await screen.findByText(/a .* b/, {}, SLOW);
      expect(container.querySelector('img, script, iframe')).toBeNull();
    });

    it('never makes a link of a dangerous scheme — S-60', async () => {
      show(
        fold(
          said(
            'm1',
            '[one](javascript:alert(1)) [two](data:text/html,x) [three](vbscript:msgbox) [ok](https://ok.example)',
          ),
        ),
      );

      await screen.findByRole('link', { name: 'ok' }, SLOW);
      expect(screen.queryByRole('link', { name: 'one' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'two' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'three' })).not.toBeInTheDocument();
    });

    it('never loads a remote image — it is a link to its address — S-61', async () => {
      const { container } = show(fold(said('m1', '![a cat](https://img.example/cat.png)')));

      const link = await screen.findByRole(
        'link',
        { name: t('markdown.image.remote', { name: 'a cat' }) },
        SLOW,
      );
      expect(link).toHaveAttribute('href', 'https://img.example/cat.png');
      expect(container.querySelector('img')).toBeNull();
    });

    it('opens an external link in a new tab, with no opener — S-62', async () => {
      show(fold(said('m1', '[docs](https://docs.example)')));

      const link = await screen.findByRole('link', { name: 'docs' }, SLOW);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer']),
      );
    });

    it('renders an answer whose code block is still open, while it streams — S-63', async () => {
      show(fold(frame('message.delta', { messageId: 'm1', delta: 'Here:\n```ts\nconst a' })));

      expect(await screen.findByText(/const a/, {}, SLOW)).toBeInTheDocument();
    });
  });

  describe('a block of code — B-15', () => {
    it('shows code of a language nobody knows monospaced, without failing — S-65', async () => {
      const { container } = show(fold(said('m1', '```klingon\nqapla\n```')));

      await screen.findByText('qapla', {}, SLOW);
      expect(container.querySelector('pre[data-language="klingon"]')).not.toBeNull();
    });

    it('copies the code exactly, and says so — S-66', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', '```ts\nconst a = 1;\n```')));

      await user.click(await screen.findByRole('button', { name: t('sessions.code.copy') }, SLOW));

      expect(await navigator.clipboard.readText()).toBe('const a = 1;');
      expect(await screen.findByText(t('sessions.code.copied'))).toBeInTheDocument();
    });

    it('cannot insert with no editor open, and says why — S-68', async () => {
      show(fold(said('m1', '```ts\nx\n```')));

      const insert = await screen.findByRole(
        'button',
        { name: t('sessions.code.insertNoEditor') },
        SLOW,
      );
      expect(insert).toHaveAttribute('aria-disabled', 'true');
    });

    it('inserts at the cursor of the editor of the tab, leaving it unsaved — S-67', async () => {
      const user = userEvent.setup();
      fakeDisk(FOLDER, { 'a.ts': 'ab' });
      const model = await openedModel('a.ts');
      let cursor: TextPosition = { line: 1, column: 2 };
      const view = {
        focus: vi.fn(),
        position: () => cursor,
        setPosition: (position: TextPosition) => {
          cursor = position;
        },
      } as unknown as CodeView;
      const release = showView(FOLDER, editorState().activeGroup, view);
      show(fold(said('m1', '```ts\nX\n```')));

      await user.click(
        await screen.findByRole('button', { name: t('sessions.code.insert') }, SLOW),
      );

      expect(model.getValue()).toBe('aXb');
      expect(editorState().docs['a.ts']?.status).toBe('ready');
      release();
    });
  });

  describe('a block of code, coloured — B-15', () => {
    it('colours the code as the editor does, by run of text — S-65', async () => {
      colouringWith(() =>
        Promise.resolve('<span class="mtk7">const</span><span class="mtk1"> a</span>'),
      );
      show(fold(said('m1', '```ts\nconst a\n```')));

      expect(await screen.findByText('const', { selector: '.mtk7' }, SLOW)).toBeInTheDocument();
    });

    it('stays monospaced when colouring fails', async () => {
      colouringWith(() => Promise.reject(new Error('no grammar')));
      show(fold(said('m1', '```ts\nconst b\n```')));

      expect(await screen.findByText('const b', {}, SLOW)).toBeInTheDocument();
    });

    it('drops a colouring that arrives after the block is gone', async () => {
      let finish: (html: string) => void = () => undefined;
      colouringWith(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
      const { unmount } = show(fold(said('m1', '```ts\nlate\n```')));
      await screen.findByText('late', {}, SLOW);

      unmount();
      await act(async () => {
        finish('<span class="mtk1">late</span>');
        await Promise.resolve();
      });

      expect(screen.queryByText('late')).not.toBeInTheDocument();
    });

    it('says so when the browser refuses the copy', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      show(fold(said('m1', '```ts\nx\n```')));

      await user.click(await screen.findByRole('button', { name: t('sessions.code.copy') }, SLOW));

      expect(await screen.findByText(t('sessions.code.copyFailed'))).toBeInTheDocument();
    });

    it('puts nothing anywhere when insert is pressed with no editor — S-68', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', '```ts\nx\n```')));

      await user.click(
        await screen.findByRole('button', { name: t('sessions.code.insertNoEditor') }, SLOW),
      );

      expect(editorState().docs).toEqual({});
    });
  });

  describe('the names of files — B-16', () => {
    it('opens a file the answer names in the editor, at the line — S-69', async () => {
      const user = userEvent.setup();
      fakeDisk(FOLDER, { 'src/a.ts': 'a\nb\nc' });
      show(fold(said('m1', 'The bug is in src/a.ts:3 and `src/a.ts` too.')));

      await user.click(await screen.findByRole('link', { name: 'src/a.ts:3' }, SLOW));

      expect(editorState().docs['src/a.ts']?.cursor).toEqual({ line: 3, column: 1 });
    });

    it('leaves the panel where it was for a file that is gone — S-71', async () => {
      const user = userEvent.setup();
      fakeDisk(FOLDER, {});
      show(fold(said('m1', 'It was in src/gone.ts:2.')));

      await user.click(await screen.findByRole('link', { name: 'src/gone.ts:2' }, SLOW));

      await waitFor(() => {
        expect(editorState().docs['src/gone.ts']?.failure?.code).toBe('FILE_NOT_FOUND');
      });
      expect(screen.getByRole('link', { name: 'src/gone.ts:2' })).toBeInTheDocument();
    });

    it('follows no relative link that is not a file of the folder', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', 'See [the docs](./docs).')));

      await user.click(await screen.findByRole('link', { name: 'the docs' }, SLOW));

      expect(editorState().docs).toEqual({});
    });

    it('links nothing with no folder to resolve names against', async () => {
      renderRouted(
        <Conversation
          conversation={fold(said('m1', 'Open src/a.ts and `src/b.ts`.'))}
          isPartial={false}
        />,
      );

      expect(await screen.findByText('src/b.ts', { selector: 'code' }, SLOW)).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('opens a file named in inline code', async () => {
      const user = userEvent.setup();
      fakeDisk(FOLDER, { 'src/a.ts': 'a' });
      show(fold(said('m1', 'See `src/a.ts`.')));

      await user.click(await screen.findByRole('button', { name: 'src/a.ts' }, SLOW));

      expect(editorState().docs['src/a.ts']).toBeDefined();
    });

    it('leaves a path out of the folder, and prose with a slash, as text — S-70', async () => {
      show(fold(said('m1', 'Not /etc/hosts.txt nor and/or.')));

      await screen.findByText(/Not .* nor and\/or\./, {}, SLOW);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('thinking — B-19', () => {
    it('shows a summarised thinking in view, and says how long it took — S-82, plan 22 D-15', async () => {
      const conversation = fold(
        frame(
          'message.delta',
          { messageId: 'm1', delta: 'Weighing it', blockType: 'thinking' },
          T0,
        ),
        frame('message.delta', { messageId: 'm1', delta: 'Answer.' }, '2026-09-19T12:00:03.000Z'),
        frame(
          'message.completed',
          {
            messageId: 'm1',
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Weighing it' },
              { type: 'text', text: 'Answer.' },
            ],
          },
          '2026-09-19T12:00:04.000Z',
        ),
      );
      show(conversation);

      const summary = await screen.findByText(t('sessions.thinking.took', { seconds: 3 }));
      expect(summary.closest('details')).toHaveAttribute('open');
      expect(screen.getByText('Weighing it')).toBeVisible();
    });

    it('says it is thinking while the thinking arrives', async () => {
      show(fold(frame('message.delta', { messageId: 'm1', delta: 'hmm', blockType: 'thinking' })));

      expect(await screen.findByText(t('sessions.thinking.live'))).toBeInTheDocument();
    });

    it('says a redacted thinking existed, and invents nothing of it — S-83', async () => {
      show(
        fold(
          frame('message.completed', {
            messageId: 'm1',
            role: 'assistant',
            content: [{ type: 'redacted_thinking' }],
          }),
        ),
      );

      expect(await screen.findByText(t('sessions.thinking.hidden'))).toBeInTheDocument();
      expect(screen.getByText(t('sessions.thinking.nothingShown'))).toBeInTheDocument();
    });

    it('says only that it thought, for thinking from the history — S-84', async () => {
      show(
        fold(
          frame(
            'message.completed',
            {
              messageId: 'm1',
              role: 'assistant',
              content: [{ type: 'thinking', thinking: 'Old thought' }],
            },
            '',
          ),
        ),
      );

      expect(await screen.findByText(t('sessions.thinking.done'))).toBeInTheDocument();
      expect(screen.getByText('Old thought')).toBeInTheDocument();
    });
  });

  describe('tools — B-17, B-18', () => {
    function bash(command: string, extra: Envelope[] = []): ConversationState {
      return fold(
        frame('tool.started', { toolUseId: 't1', toolName: 'Bash', input: { command } }),
        ...extra,
      );
    }

    it('says how a tool is doing by word, as it changes — S-75', async () => {
      const { rerender } = show(bash('ls'));
      const running = await screen.findByRole('button', { name: /Bash: ls/ });
      expect(running).toHaveTextContent(t('session.toolStatus.running'));

      act(() => {
        rerender(<></>);
      });
      show(bash('ls', [frame('tool.completed', { toolUseId: 't1', status: 'succeeded' })]));
      expect(await screen.findByRole('button', { name: /Bash: ls/ })).toHaveTextContent(
        t('session.toolStatus.succeeded'),
      );
    });

    it('colours what the tool reported by role, and keeps no terminal link — S-77, S-78', async () => {
      const user = userEvent.setup();
      const ESC = String.fromCharCode(0x1b);
      const BEL = String.fromCharCode(0x07);
      const { container } = show(
        bash('pnpm test', [
          frame('tool.completed', {
            toolUseId: 't1',
            status: 'failed',
            summary: `${ESC}[31mFAIL${ESC}[0m ${ESC}]8;;https://evil.example${BEL}click${ESC}]8;;${BEL}`,
          }),
        ]),
      );

      await user.click(await screen.findByRole('button', { name: /Bash: pnpm test/ }));

      expect(screen.getByText('FAIL')).toHaveClass('text-destructive');
      expect(screen.getByText(/click/)).toBeInTheDocument();
      expect(container.innerHTML).not.toContain('evil.example');
    });

    it('shows the end of an output above the ceiling, and all of it on request — S-79', async () => {
      const user = userEvent.setup();
      const output = `START${'x'.repeat(OUTPUT_CEILING)}END`;
      show(
        bash('cat big', [
          frame('tool.completed', { toolUseId: 't1', status: 'succeeded', summary: output }),
        ]),
      );

      await user.click(await screen.findByRole('button', { name: /Bash: cat big/ }));
      expect(screen.getByText(/END$/)).toBeInTheDocument();
      expect(screen.queryByText(/^START/)).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', {
          name: t('sessions.output.showAll', { count: output.length }),
        }),
      );
      expect(screen.getByText(/^START/)).toBeInTheDocument();
    });

    it('leads to the trail of the tool', async () => {
      const user = userEvent.setup();
      show(bash('ls'));

      await user.click(await screen.findByRole('button', { name: /Bash: ls/ }));

      expect(screen.getByRole('link', { name: t('sessions.toolRow.trail') })).toHaveAttribute(
        'href',
        expect.stringContaining('/audit?'),
      );
    });
  });

  describe('subagents — B-21', () => {
    const opened = frame('tool.started', {
      toolUseId: 'a1',
      toolName: 'Agent',
      input: { description: 'look around', subagent_type: 'Explore' },
    });

    it('nests what a subagent did under the tool that opened it — S-88', async () => {
      const user = userEvent.setup();
      show(
        fold(
          opened,
          frame('tool.started', {
            toolUseId: 't2',
            toolName: 'Glob',
            input: { pattern: '*.ts' },
            parentToolUseId: 'a1',
          }),
          said('s1', 'Found three.', { parentToolUseId: 'a1' }),
          said('m1', 'Done looking.'),
        ),
      );

      const main = await screen.findByRole('list', { name: t('session.screen.conversation') });
      expect(within(main).queryByText('Found three.')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Subagent \(Explore\)/ }));

      const nested = screen.getByRole('list', { name: t('sessions.subagent.label') });
      expect(await within(nested).findByText('Found three.', {}, SLOW)).toBeInTheDocument();
      expect(within(nested).getByRole('button', { name: /\*\.ts/ })).toBeInTheDocument();
    });

    it('never mixes the children of two subagents — S-89', async () => {
      const user = userEvent.setup();
      show(
        fold(
          opened,
          frame('tool.started', {
            toolUseId: 'a2',
            toolName: 'Agent',
            input: { description: 'other' },
          }),
          said('x', 'of the first', { parentToolUseId: 'a1' }),
          said('y', 'of the second', { parentToolUseId: 'a2' }),
        ),
      );

      await user.click(await screen.findByRole('button', { name: /look around/ }));

      const nested = screen.getByRole('list', { name: t('sessions.subagent.label') });
      expect(await within(nested).findByText('of the first', {}, SLOW)).toBeInTheDocument();
      expect(within(nested).queryByText('of the second')).not.toBeInTheDocument();
    });

    it('loads a subagent of the history when its row is unfolded — S-90', async () => {
      const user = userEvent.setup();
      const get = vi.spyOn(api, 'get').mockResolvedValue({
        events: [
          {
            type: 'message.completed',
            payload: {
              messageId: 'h1',
              role: 'assistant',
              content: [{ type: 'text', text: 'From the store.' }],
              parentToolUseId: 'a1',
            },
          },
        ],
        nextCursor: null,
      });
      show(fold(opened), { conversationId: 'conv-1' });

      expect(get).not.toHaveBeenCalled();
      await user.click(await screen.findByRole('button', { name: /look around/ }));

      expect(await screen.findByText('From the store.', {}, SLOW)).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith('/transcripts/conv-1/subagents/a1/messages');
    });

    it('says the history has nothing of a subagent that said nothing', async () => {
      const user = userEvent.setup();
      vi.spyOn(api, 'get').mockResolvedValue({ events: [] });
      show(fold(opened), { conversationId: 'conv-1' });

      await user.click(await screen.findByRole('button', { name: /look around/ }));

      expect(
        await screen.findByRole('list', { name: t('sessions.subagent.label') }),
      ).toBeEmptyDOMElement();
    });

    it('says why a subagent cannot be read, with a retry — S-91', async () => {
      const user = userEvent.setup();
      vi.spyOn(api, 'get').mockRejectedValue(
        new AppError('NOT_FOUND', 'error.notFound', 'trace-1'),
      );
      show(fold(opened), { conversationId: 'conv-1' });

      await user.click(await screen.findByRole('button', { name: /look around/ }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      const calls = vi.mocked(api.get).mock.calls.length;
      await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
      await waitFor(() => {
        expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(calls);
      });
    });
  });

  describe('turns — B-23', () => {
    it('marks where the conversation was compacted', async () => {
      show(
        fold(
          said('m1', 'before'),
          frame('session.compacted', { trigger: 'auto', preTokens: 150000 }),
        ),
      );

      expect(
        await screen.findByRole('separator', { name: t('sessions.compacted.label') }),
      ).toHaveTextContent(t('sessions.compacted.autoTokens', { tokens: '150,000' }));
    });

    it('marks a manual compaction with its count, and an automatic one without', async () => {
      show(
        fold(frame('session.compacted', { trigger: 'manual', preTokens: 1200 }), {
          ...frame('session.compacted', {}),
          id: 'second',
        } as Envelope),
      );

      expect(
        await screen.findByText(t('sessions.compacted.manualTokens', { tokens: '1,200' })),
      ).toBeInTheDocument();
      expect(screen.getByText(t('sessions.compacted.auto'))).toBeInTheDocument();
    });

    it('says a cost it cannot read as nothing, never NaN — S-98', async () => {
      show(
        fold(
          frame('turn.completed', {
            turnId: 'turn-1',
            costUsd: 'n/a',
            durationMs: 1500,
            usage: {},
          }),
        ),
      );

      expect(
        await screen.findByText(t('sessions.turn.noUsage', { cost: '$0.00', seconds: '1.5' })),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('NaN');
    });

    it('draws nothing for an entry whose content it does not have', async () => {
      const timeline = [
        { kind: 'message', id: 'gone' },
        { kind: 'tool', id: 'gone' },
        { kind: 'turn', id: 'gone' },
      ] as const;
      show({ ...SILENT, timeline });

      expect(
        await screen.findByRole('list', { name: t('session.screen.conversation') }),
      ).toBeEmptyDOMElement();
    });

    it('marks a manual compaction with no count', async () => {
      show(fold(frame('session.compacted', { trigger: 'manual' })));

      expect(await screen.findByText(t('sessions.compacted.manual'))).toBeInTheDocument();
    });
  });

  describe('copy and search — B-24', () => {
    it('copies the markdown the message was written in — S-100', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', '**bold** and `code`')));

      await user.click(await screen.findByRole('button', { name: t('sessions.message.copy') }));

      expect(await navigator.clipboard.readText()).toBe('**bold** and `code`');
      expect(await screen.findByText(t('sessions.message.copied'))).toBeInTheDocument();
    });

    it('copies the message from its context menu too — S-100', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', 'from the menu')));

      fireEvent.contextMenu(await screen.findByText('from the menu', {}, SLOW));
      await user.click(await screen.findByRole('menuitem', { name: t('sessions.message.copy') }));

      expect(await navigator.clipboard.readText()).toBe('from the menu');
    });

    it('finds, marks and walks the occurrences, and asks for the whole conversation — S-101', async () => {
      const user = userEvent.setup();
      const everything = vi.fn();
      show(fold(said('m1', 'the clock'), said('m2', 'no match'), said('m3', 'clock again')), {
        onSearchEverything: everything,
      });
      const list = await screen.findByRole('list', { name: t('session.screen.conversation') });

      fireEvent.keyDown(list, { key: 'f', ctrlKey: true });
      await user.type(screen.getByRole('searchbox', { name: t('sessions.search.label') }), 'clock');

      const search = screen.getByRole('search');
      expect(within(search).getByRole('status')).toHaveTextContent(
        t('sessions.search.position', { at: 1, count: 2 }),
      );
      const current = (): string | null =>
        document
          .querySelector('[aria-current="true"][data-message-id]')
          ?.getAttribute('data-message-id') ?? null;
      expect(current()).toBe('m1');

      await user.click(screen.getByRole('button', { name: t('sessions.search.next') }));
      expect(current()).toBe('m3');
      await user.click(screen.getByRole('searchbox'));
      await user.keyboard('{Enter}');
      expect(current()).toBe('m1');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(current()).toBe('m3');
      expect(screen.getByRole('searchbox')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: t('sessions.search.previous') }));
      expect(current()).toBe('m1');

      await user.click(screen.getByRole('button', { name: t('sessions.search.everything') }));
      expect(everything).toHaveBeenCalled();

      await user.click(screen.getByRole('searchbox'));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
    });

    it('says when nothing is found — S-102', async () => {
      const user = userEvent.setup();
      show(fold(said('m1', 'hello')));
      const list = await screen.findByRole('list', { name: t('session.screen.conversation') });

      fireEvent.keyDown(list, { key: 'f', metaKey: true });
      await user.type(screen.getByRole('searchbox'), 'absent');

      expect(within(screen.getByRole('search')).getByRole('status')).toHaveTextContent(
        t('sessions.search.none'),
      );
      await user.click(screen.getByRole('button', { name: t('sessions.search.next') }));
      expect(document.querySelector('[aria-current="true"][data-message-id]')).toBeNull();
      await user.click(screen.getByRole('button', { name: t('sessions.search.close') }));
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
    });

    it('leaves Ctrl+F to the browser outside the conversation', async () => {
      show(fold(said('m1', 'hello')));
      await screen.findByRole('list', { name: t('session.screen.conversation') });

      fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });

      expect(screen.queryByRole('search')).not.toBeInTheDocument();
    });
  });

  it('has no accessibility violation', async () => {
    const { container } = show(
      fold(
        frame('message.delta', { messageId: 'm0', delta: 'hmm', blockType: 'thinking' }),
        said('m1', '# Title\n\n```ts\nconst a = 1;\n```'),
        frame('tool.started', {
          toolUseId: 't1',
          toolName: 'Read',
          input: { file_path: `${FOLDER}/a.ts` },
        }),
        frame('turn.completed', { turnId: 'turn-1', costUsd: '0.01', durationMs: 1000, usage: {} }),
      ),
    );
    await screen.findByRole('heading', { name: 'Title' }, SLOW);

    expect(await axe(container)).toHaveNoViolations();
  });
});
