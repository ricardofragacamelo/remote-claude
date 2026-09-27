import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ConversationList } from '@/features/transcript';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import {
  aConversationDto,
  claudeUnavailable,
  EDITOR,
  OURS,
  WORKSPACE,
  WRITTEN,
} from '../../../support/history';

const t = translator('en');

function mount() {
  const onOpen = vi.fn();
  const view = render(<ConversationList workspacePath={WORKSPACE} onOpen={onOpen} />);
  return { ...view, onOpen };
}

/**
 * The conversations of one workspace — the second level of the history (plan 04, B-06, D-03).
 *
 * What matters most is the label: a conversation begun in the editor showing up is a feature, and
 * without saying where it came from it reads as data leaking from somewhere else.
 */
describe('the conversations of a workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while the list is on its way', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    mount();

    expect(screen.getByLabelText(t('transcript.list.loading'))).toBeInTheDocument();
  });

  it('says what to do when nothing was said in the folder yet — S-13', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });
    mount();

    expect(await screen.findByText(t('transcript.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('transcript.list.emptyDescription'))).toBeInTheDocument();
  });

  it('shows the failure, translated, with a way to try again — S-17', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(claudeUnavailable)
      .mockResolvedValueOnce({ sessions: [aConversationDto()], nextCursor: null });
    mount();

    expect(await screen.findByText(t('transcript.error.claudeUnavailable'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('Fix the flaky test')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('labels every row with where it came from, and never as the editor — S-11', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      sessions: [
        aConversationDto(),
        aConversationDto({ sessionId: EDITOR, summary: 'Begun in the editor', origin: 'external' }),
      ],
      nextCursor: null,
    });
    mount();

    const ours = await screen.findByRole('button', { name: /Fix the flaky test/ });
    const theirs = screen.getByRole('button', { name: /Begun in the editor/ });

    expect(within(ours).getByText(t('history.origin.ours'))).toBeInTheDocument();
    expect(within(theirs).getByText(t('history.origin.external'))).toBeInTheDocument();
    expect(screen.queryByText(/vscode/i)).not.toBeInTheDocument();
  });

  it('asks for the conversations of that workspace, and only that one — S-12', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });
    mount();

    await screen.findByText(t('transcript.list.emptyTitle'));

    expect(get).toHaveBeenCalledWith('/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp');
    expect(screen.getByText(WORKSPACE)).toBeInTheDocument();
  });

  it('names an untitled conversation, and the branch it ran on', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      sessions: [aConversationDto({ summary: '', gitBranch: 'main' })],
      nextCursor: null,
    });
    mount();

    expect(await screen.findByText(t('transcript.list.untitled'))).toBeInTheDocument();
    expect(
      screen.getByText(t('transcript.list.lastModifiedOnBranch', { at: WRITTEN, branch: 'main' })),
    ).toBeInTheDocument();
  });

  it('opens the conversation that was chosen', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ sessions: [aConversationDto()], nextCursor: null });
    const { onOpen } = mount();

    await userEvent.click(await screen.findByRole('button', { name: /Fix the flaky test/ }));

    expect(onOpen).toHaveBeenCalledWith(OURS);
  });

  it('appends the next page, and keeps what is on screen when the next one fails', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ sessions: [aConversationDto()], nextCursor: 'next' })
      .mockRejectedValueOnce(claudeUnavailable)
      .mockResolvedValueOnce({
        sessions: [aConversationDto({ sessionId: EDITOR, summary: 'Older', origin: 'external' })],
        nextCursor: null,
      });
    mount();

    await userEvent.click(
      await screen.findByRole('button', { name: t('transcript.list.loadMore') }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('transcript.error.claudeUnavailable'),
    );
    expect(screen.getByText('Fix the flaky test')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t('transcript.list.loadMore') }));

    expect(await screen.findByText('Older')).toBeInTheDocument();
    expect(screen.getByText('Fix the flaky test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('transcript.list.loadMore') })).toBeNull();
    expect(get).toHaveBeenLastCalledWith(
      '/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp&cursor=next',
    );
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ sessions: [aConversationDto()], nextCursor: null });
    const { container } = mount();

    await screen.findByText('Fix the flaky test');

    expect(await axe(container)).toHaveNoViolations();
  });
});
