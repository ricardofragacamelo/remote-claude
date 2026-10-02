import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DiffHunks } from '@/shared/components/DiffHunks';
import type { Hunk } from '@/shared/lib/diff-hunk';
import { render, translator } from '../../../support/render';

const t = translator('en');

const first: Hunk = {
  id: 'h1',
  oldStart: 3,
  newStart: 3,
  lines: [
    { kind: 'context', text: 'keep' },
    { kind: 'removed', text: 'old' },
    { kind: 'added', text: 'new' },
  ],
};
const second: Hunk = {
  id: 'h2',
  oldStart: 20,
  newStart: 20,
  lines: [{ kind: 'added', text: 'later' }],
};

const actOn = (id: string): string => `act on ${id}`;
const group = (): HTMLElement => screen.getByRole('group', { name: 'the diff' });

/** The hunks of a diff, shared by the chat, the card that asks and "Changes" — plan 08, F3. */
describe('the hunks of a diff', () => {
  it('shows every line, saying what each changed one is', async () => {
    const { container } = render(<DiffHunks hunks={[first, second]} label="the diff" />);

    expect(within(group()).getByText('old')).toBeVisible();
    expect(within(group()).getByText('later')).toBeVisible();
    expect(within(group()).getAllByText(t('diff.line.removed').trim())).toHaveLength(1);
    expect(within(group()).getAllByText(t('diff.line.added').trim())).toHaveLength(2);
    expect(screen.queryByRole('button')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('folds past a number of lines — a hunk past the fold is not drawn — and unfolds on asking', async () => {
    const user = userEvent.setup();
    render(<DiffHunks hunks={[first, second]} label="the diff" foldAfter={2} />);

    expect(within(group()).getByText('old')).toBeVisible();
    expect(within(group()).queryByText('new')).toBeNull();
    expect(within(group()).queryByText('later')).toBeNull();

    await user.click(screen.getByRole('button', { name: t('diff.hunks.showAll', { count: 4 }) }));

    expect(within(group()).getByText('later')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not fold what fits', () => {
    render(<DiffHunks hunks={[first]} label="the diff" foldAfter={10} />);

    expect(within(group()).getByText('new')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the actions of each hunk above it', () => {
    render(
      <DiffHunks
        hunks={[first, second]}
        label="the diff"
        actions={(hunk) => <button type="button">{actOn(hunk.id)}</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'act on h1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'act on h2' })).toBeVisible();
  });
});
