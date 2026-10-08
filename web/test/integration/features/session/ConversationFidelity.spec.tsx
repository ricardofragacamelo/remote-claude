import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { Envelope } from '@remote-claude/contracts';

import { Conversation } from '@/features/session/components/Conversation';
import {
  conversationFrom,
  readEvent,
  SILENT,
} from '@/features/session/services/conversation-reducer';
import type { HistoryEvent } from '@/features/session/types/history';
import type { Conversation as ConversationState } from '@/features/session/types/live-session';
import { api } from '@/shared/api/api';
import type { BytesResponse } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { fakeObjectUrls } from '../../../support/raw-api';
import { render, translator } from '../../../support/render';

const t = translator('en');
const T0 = '2026-10-07T12:00:00.000Z';
const CONVERSATION = '3f2a6c1e-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
});

function at(seconds: number): string {
  return new Date(Date.parse(T0) + seconds * 1000).toISOString();
}

/** One event of the history, as a page carries it. */
function event(type: string, payload: Record<string, unknown>): HistoryEvent {
  return { type, payload };
}

/** A frame of the live stream, at `seconds` after T0. */
function frame(type: string, payload: Record<string, unknown>, seconds = 0): Envelope {
  return { v: 1, id: `f-${type}`, kind: 'event', type, ts: at(seconds), payload } as Envelope;
}

function prompt(messageId: string, content: unknown[], extra: Record<string, unknown> = {}) {
  return { messageId, role: 'user', content, ...extra };
}

function answer(messageId: string, content: unknown[], extra: Record<string, unknown> = {}) {
  return { messageId, role: 'assistant', content, ...extra };
}

function bashStarted(extra: Record<string, unknown> = {}) {
  return { toolUseId: 't1', toolName: 'Bash', input: { command: 'pnpm test --run' }, ...extra };
}

/** The conversation as the reader and the live session both draw it — the same components. */
function show(
  conversation: ConversationState,
  conversationId: string | null = CONVERSATION,
): ReturnType<typeof render> {
  return render(
    <Conversation
      conversation={conversation}
      isPartial={false}
      folder="/home/dev/project"
      sessionId={null}
      conversationId={conversationId}
    />,
  );
}

function fromHistory(...events: HistoryEvent[]): ConversationState {
  return conversationFrom(events);
}

function live(...frames: Envelope[]): ConversationState {
  return frames.reduce(readEvent, SILENT);
}

/** The labels of who speaks, in the order they are drawn. */
function authors(): string[] {
  const conversation = screen.getByRole('list', { name: t('session.screen.conversation') });
  return within(conversation)
    .queryAllByText(new RegExp(`^(${t('session.role.assistant')}|${t('session.role.user')})$`))
    .map((each) => each.textContent ?? '');
}

describe('thinking, as the Claude Code shows it — plan 22, B-27', () => {
  it('says "Thought", folded, for one the model omitted; open, that it did not show it — S-101', async () => {
    const user = userEvent.setup();
    show(fromHistory(event('message.completed', answer('m1', [{ type: 'thinking' }]))));

    const label = screen.getByText(t('sessions.thinking.done'));
    expect(label.closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByText(t('sessions.thinking.hidden'))).toBeNull();

    await user.click(label);
    expect(screen.getByText(t('sessions.thinking.nothingShown'))).toBeVisible();
  });

  it('shows a summarised one in view, quiet, under "Thought" — S-102', () => {
    show(
      fromHistory(
        event('message.completed', answer('m1', [{ type: 'thinking', thinking: 'Weighing it' }])),
      ),
    );

    const text = screen.getByText('Weighing it');
    expect(text).toBeVisible();
    expect(text).toHaveClass('italic');
    expect(text.closest('details')?.querySelector('summary')).toHaveTextContent(
      t('sessions.thinking.done'),
    );
  });

  it('says a redacted one was hidden — S-103', () => {
    show(fromHistory(event('message.completed', answer('m1', [{ type: 'redacted_thinking' }]))));

    expect(screen.getByText(t('sessions.thinking.hidden'))).toBeInTheDocument();
  });

  it('says how long at most, from the instants of the history — S-104', () => {
    show(
      fromHistory(
        event('message.completed', prompt('p1', [{ type: 'text', text: 'Go' }], { at: at(0) })),
        event('message.completed', answer('m1', [{ type: 'thinking' }], { at: at(7.2) })),
      ),
    );

    expect(screen.getByText(t('sessions.thinking.tookUpTo', { seconds: 7 }))).toBeInTheDocument();
  });

  it('says no duration without the instants — S-106', () => {
    show(
      fromHistory(
        event('message.completed', prompt('p1', [{ type: 'text', text: 'Go' }])),
        event('message.completed', answer('m1', [{ type: 'thinking' }], { at: at(7) })),
      ),
    );

    expect(screen.getByText(t('sessions.thinking.done'))).toBeInTheDocument();
  });

  it('keeps measuring live, with no "up to" — S-107', () => {
    show(
      live(
        frame('message.delta', { messageId: 'm1', delta: 'Hm', blockType: 'thinking' }, 0),
        frame('message.completed', answer('m1', [{ type: 'thinking', thinking: 'Hm' }]), 3),
      ),
    );

    expect(screen.getByText(t('sessions.thinking.took', { seconds: 3 }))).toBeInTheDocument();
    expect(screen.queryByText(/up to/)).toBeNull();
  });
});

describe('the author once per turn — plan 22, B-28', () => {
  /** A turn: a prompt, and three answers of the API around a tool, the middle one only the call. */
  const turn = [
    event('message.completed', prompt('p1', [{ type: 'text', text: 'Run the tests' }])),
    event('message.completed', answer('m1', [{ type: 'text', text: 'Running them.' }])),
    event('message.completed', answer('m2', [{ type: 'tool_use', toolUseId: 't1' }])),
    event('tool.started', bashStarted()),
    event('tool.completed', { toolUseId: 't1', status: 'succeeded', summary: 'ok' }),
    event('message.completed', answer('m3', [{ type: 'text', text: 'All green.' }])),
  ];

  it('says "Claude" once for a turn of several answers — S-108', () => {
    show(fromHistory(...turn));

    expect(authors()).toEqual([t('session.role.user'), t('session.role.assistant')]);
    expect(screen.getByText('All green.')).toBeInTheDocument();
  });

  it('draws no header, nor any line, for an answer of only a tool call — S-109', () => {
    show(fromHistory(...turn));

    expect(document.querySelector('[data-message-id="m2"]')).toBeNull();
  });

  it('opens a new turn at a queued prompt, which names the author again — S-110 (reader)', () => {
    show(
      fromHistory(
        ...turn.slice(0, 5),
        event('message.completed', prompt('p2', [{ type: 'text', text: 'And lint' }])),
        event('message.completed', answer('m3', [{ type: 'text', text: 'All green.' }])),
      ),
    );

    expect(authors()).toEqual([
      t('session.role.user'),
      t('session.role.assistant'),
      t('session.role.user'),
      t('session.role.assistant'),
    ]);
  });

  it('opens a new turn at a queued prompt in the live session too — S-110 (live)', () => {
    show(
      live(
        frame('message.completed', prompt('p1', [{ type: 'text', text: 'Run the tests' }])),
        frame('message.completed', answer('m1', [{ type: 'text', text: 'Running them.' }])),
        frame('message.completed', answer('m1', [{ type: 'text', text: 'Still on it.' }])),
        frame('message.completed', answer('m2', [{ type: 'text', text: 'Half done.' }])),
        frame('message.completed', prompt('p2', [{ type: 'text', text: 'And lint' }])),
        frame('message.completed', answer('m3', [{ type: 'text', text: 'Linting.' }])),
        frame('turn.completed', { turnId: 'turn-1', costUsd: '0.01', durationMs: 10 }),
        frame('message.delta', { messageId: 'm4', delta: 'After the turn' }),
      ),
    );

    expect(authors()).toEqual([
      t('session.role.user'),
      t('session.role.assistant'),
      t('session.role.user'),
      t('session.role.assistant'),
      t('session.role.assistant'),
    ]);
  });

  it('keeps "copy" on an answer that does not say its author', () => {
    show(fromHistory(...turn));

    const item = document.querySelector('[data-message-id="m3"]');
    expect(item).not.toBeNull();
    expect(
      within(item as HTMLElement).getByRole('button', { name: t('sessions.message.copy') }),
    ).toBeInTheDocument();
  });

  it('has no violation of accessibility', async () => {
    const { container } = show(fromHistory(...turn));

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('a tool by its title, with IN and OUT — plan 22, B-29', () => {
  const WHOLE = {
    text: 'line 1\nline 2\n\u001b[32mall 40 passed\u001b[0m',
    truncated: false,
    bytes: 40,
  };

  function finished(extra: Record<string, unknown> = {}, status = 'succeeded'): ConversationState {
    return fromHistory(
      event('tool.started', bashStarted(extra)),
      event('tool.completed', { toolUseId: 't1', status, summary: '…all 40 passed' }),
    );
  }

  function row(name: RegExp | string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  it('is "Bash · description" with a title, and the command is still in its name — S-111', () => {
    show(finished({ title: 'Run the tests' }));

    const line = row(
      t('sessions.toolRow.labelTitled', {
        tool: t('sessions.tool.titled', { name: 'Bash', title: 'Run the tests' }),
        detail: t('sessions.tool.bash', { command: 'pnpm test --run' }),
        status: t('session.toolStatus.succeeded'),
      }),
    );
    expect(line).toHaveTextContent('Bash · Run the tests');
  });

  it('is the line of today without one — S-111', () => {
    show(finished());

    expect(row(/Bash: pnpm test --run/)).toHaveTextContent('Bash: pnpm test --run');
  });

  it('unfolds a shell call into IN, the command in mono, and OUT, its output — S-112', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    show(finished());

    await user.click(row(/Bash: pnpm test --run/));

    const input = screen.getByRole('region', { name: t('sessions.toolRow.input') });
    expect(within(input).getByText('pnpm test --run')).toHaveClass('font-code');
    expect(input).toHaveTextContent(t('sessions.toolRow.in'));
    const output = screen.getByRole('region', { name: t('sessions.toolRow.output') });
    expect(output).toHaveTextContent(t('sessions.toolRow.out'));
    expect(output).toHaveTextContent('…all 40 passed');
    expect(within(output).getByRole('status')).toHaveTextContent(
      t('sessions.toolRow.outputLoading'),
    );
  });

  it('lets the keyboard reach IN and OUT, which scroll inside the row — S-127, found by the e2e', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue(WHOLE);
    show(finished());

    await user.click(row(/Bash: pnpm test --run/));
    await screen.findByText('line 1', { exact: false });
    const input = screen.getByRole('region', { name: t('sessions.toolRow.input') });
    const output = screen.getByRole('region', { name: t('sessions.toolRow.output') });

    await user.tab();
    expect(input.querySelector('pre')).toHaveFocus();
    await user.tab();
    expect(output.querySelector('pre')).toHaveFocus();
  });

  it('keeps the input of any other tool as it was — S-112', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    show(
      fromHistory(
        event('tool.started', {
          toolUseId: 't1',
          toolName: 'Read',
          input: { file_path: '/home/dev/project/a.ts' },
        }),
        event('tool.completed', { toolUseId: 't1', status: 'succeeded', summary: 'export {}' }),
      ),
    );

    await user.click(row(/Read a\.ts/));

    expect(screen.getByLabelText(t('sessions.toolRow.input'))).toHaveTextContent(
      '"file_path": "/home/dev/project/a.ts"',
    );
    // It scrolls inside the row too, so the keyboard reaches it.
    expect(screen.getByLabelText(t('sessions.toolRow.input'))).toHaveAttribute('tabindex', '0');
    expect(screen.queryByRole('region', { name: t('sessions.toolRow.output') })).toBeNull();
    expect(screen.getByText('export {}')).toBeInTheDocument();
  });

  it('asks for the whole output once, however often it is unfolded — S-113', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, 'get').mockResolvedValue(WHOLE);
    show(finished());
    const line = row(/Bash: pnpm test --run/);

    await user.click(line);
    expect(await screen.findByText('line 1', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('all 40 passed')).toHaveClass('text-success');
    await user.click(line);
    await user.click(line);

    expect(screen.getByText('line 1', { exact: false })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      `/transcripts/${CONVERSATION}/tools/t1/result`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('says how large a cut output was, and marks where it was cut — S-114', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue({
      text: 'HEAD-PARTTAIL-PART',
      truncated: true,
      bytes: 3_000_000,
      cutAt: 9,
    });
    show(finished());

    await user.click(row(/Bash: pnpm test --run/));

    expect(
      await screen.findByText(t('sessions.toolRow.outputTruncated', { size: '3 MB' })),
    ).toBeInTheDocument();
    const output = screen.getByRole('region', { name: t('sessions.toolRow.output') });
    expect(output).toHaveTextContent(`HEAD-PART ${t('sessions.toolRow.outputCut')} TAIL-PART`);
  });

  it('keeps the end when the route fails, says so, and tries again — S-115', async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(new AppError('NOT_FOUND', 'transcript.error.notFound', 'tr'))
      .mockResolvedValueOnce(WHOLE);
    show(finished({}, 'failed'));

    await user.click(row(/Bash: pnpm test --run/));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('sessions.toolRow.outputFailed'));
    expect(screen.getByText('…all 40 passed')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('line 1', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('asks for nothing while the tool runs — S-116', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, 'get');
    show(fromHistory(event('tool.started', bashStarted())));

    await user.click(row(/Bash: pnpm test --run/));

    expect(screen.getByRole('region', { name: t('sessions.toolRow.input') })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('sessions.toolRow.output') })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused tool', () => finished({}, 'denied'), CONVERSATION],
    [
      'a tool of a subagent, which the route does not read',
      () =>
        fromHistory(
          event('tool.started', bashStarted({ parentToolUseId: 'agent-1' })),
          event('tool.completed', { toolUseId: 't1', status: 'succeeded', summary: 'ok' }),
          event('tool.started', { toolUseId: 'agent-1', toolName: 'Agent', input: {} }),
        ),
      CONVERSATION,
    ],
    ['a live session not yet in the store', () => finished(), null],
  ])('asks for nothing for %s', async (_case, conversation, conversationId) => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, 'get').mockResolvedValue({ events: [], nextCursor: null });
    show(conversation(), conversationId);

    const lines = screen.getAllByRole('button', { name: /Bash|Agent|Subagent/ });
    for (const line of lines) {
      await user.click(line);
    }
    for (const line of screen.getAllByRole('button', { name: /Bash: pnpm/ })) {
      await user.click(line);
    }

    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/result'), expect.anything());
  });
});

describe('the image of a prompt — plan 22, B-30', () => {
  const PNG = { type: 'image', blockId: 'p1:1', mediaType: 'image/png', size: 48_213 };

  function withImage(content: unknown[] = [{ type: 'text', text: 'Look', blockId: 'p1:0' }, PNG]) {
    return fromHistory(event('message.completed', prompt('p1', content)));
  }

  function bytes(): BytesResponse {
    return { status: 200, blob: new Blob(['png'], { type: 'image/png' }), header: () => null };
  }

  it('says "Attached image", its type and its size — S-118', () => {
    show(withImage());

    expect(
      screen.getByText(t('sessions.image.attachedWith', { details: 'PNG, 48.2 kB' })),
    ).toBeInTheDocument();
    expect(screen.getByText('Look')).toBeInTheDocument();
  });

  it('says only "Attached image" when it does not know more — S-19', () => {
    show(withImage([{ type: 'image', blockId: 'p1:0' }]));

    expect(screen.getByText(t('sessions.image.attached'))).toBeInTheDocument();
  });

  it('keeps the turn of a prompt of only an image, with its author — S-121', () => {
    show(withImage([PNG]));

    expect(authors()).toEqual([t('session.role.user')]);
    expect(screen.getByRole('button', { name: t('sessions.image.open') })).toBeInTheDocument();
  });

  it('opens it by a blob:, fetched with the credential, and revokes it on close — S-119', async () => {
    const user = userEvent.setup();
    const urls = fakeObjectUrls();
    const read = vi.spyOn(api, 'bytes').mockResolvedValue(bytes());
    show(withImage());

    await user.click(screen.getByRole('button', { name: t('sessions.image.open') }));

    const image = await screen.findByRole('img', { name: t('sessions.image.alt') });
    expect(image).toHaveAttribute('src', 'blob:http://localhost/object-1');
    expect(read).toHaveBeenCalledWith(
      `/transcripts/${CONVERSATION}/images/p1%3A1`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await user.click(screen.getByRole('button', { name: t('sessions.image.close') }));

    await waitFor(() => {
      expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
    });
    expect(screen.queryByRole('img', { name: t('sessions.image.alt') })).toBeNull();
  });

  it('revokes it when Esc closes the dialog too — S-119', async () => {
    const user = userEvent.setup();
    const urls = fakeObjectUrls();
    vi.spyOn(api, 'bytes').mockResolvedValue(bytes());
    show(withImage());
    await user.click(screen.getByRole('button', { name: t('sessions.image.open') }));
    await screen.findByRole('img', { name: t('sessions.image.alt') });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    [
      'UNSUPPORTED_MEDIA_TYPE',
      'transcript.error.imageTypeUnsupported',
      { mediaType: 'image/svg+xml' },
    ],
    ['PAYLOAD_TOO_LARGE', 'transcript.error.imageTooLarge', {}],
    ['NOT_FOUND', 'transcript.error.notFound', {}],
  ])(
    'says %s in words in the place of the image, with nothing to retry — S-120',
    async (code, messageKey, params) => {
      const user = userEvent.setup();
      fakeObjectUrls();
      vi.spyOn(api, 'bytes').mockRejectedValue(new AppError(code, messageKey, 'tr', params));
      show(withImage());

      await user.click(screen.getByRole('button', { name: t('sessions.image.open') }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(t(messageKey, params));
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(screen.queryByRole('img')).toBeNull();
    },
  );

  it('offers to try again when the image did not arrive', async () => {
    const user = userEvent.setup();
    fakeObjectUrls();
    vi.spyOn(api, 'bytes')
      .mockRejectedValueOnce(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 'tr'))
      .mockResolvedValueOnce(bytes());
    show(withImage());
    await user.click(screen.getByRole('button', { name: t('sessions.image.open') }));

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByRole('img', { name: t('sessions.image.alt') })).toBeInTheDocument();
  });

  it.each([
    ['no conversation of the store yet', withImage(), null],
    ['a block an older server did not name', withImage([{ type: 'image', size: 3 }]), CONVERSATION],
  ])('is the marker alone for %s', (_case, conversation, conversationId) => {
    show(conversation, conversationId);

    expect(screen.queryByRole('button', { name: t('sessions.image.open') })).toBeNull();
    expect(screen.getByText(/Attached image/)).toBeInTheDocument();
  });

  it('says it in Portuguese too', () => {
    const tPt = translator('pt-BR');
    render(
      <Conversation
        conversation={withImage([PNG])}
        isPartial={false}
        conversationId={CONVERSATION}
      />,
      'pt-BR',
    );

    expect(
      screen.getByText(tPt('sessions.image.attachedWith', { details: 'PNG, 48,2 kB' })),
    ).toBeInTheDocument();
  });
});
