import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FileFacts } from '@/features/audit';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import { render, translator } from '../../../support/render';

const t = translator('en');

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

function anEvent(
  id: string,
  kind: string,
  label: string,
  details: Record<string, unknown> | null = null,
) {
  return {
    id,
    kind,
    subjectId: `/srv/projects/app/${label}`,
    subjectLabel: label,
    details,
    at: '2026-09-30T12:00:00.000Z',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the facts about files in the audit — S-196', () => {
  it('shows each act, the path, who and when — and never a file’s contents', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      events: [
        anEvent('e1', 'file.written', 'src/a.ts', {
          sizeBytes: 12,
          hashBefore: 'h1',
          hashAfter: 'h2',
        }),
        anEvent('e2', 'file.moved', 'src/b.ts', { from: 'src/b.ts', to: 'lib/b.ts' }),
        anEvent('e3', 'file.deleted', 'old.ts'),
        anEvent('e4', 'device.registered', 'a-phone'),
      ],
      nextCursor: null,
    });

    const { container } = render(<FileFacts />);

    const list = await screen.findByRole('list', { name: t('audit.files.title') });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(t('audit.fileAct.written'));
    expect(rows[0]).toHaveTextContent('src/a.ts');
    expect(rows[0]).toHaveTextContent(t('audit.files.byYou'));
    expect(rows[0]).not.toHaveTextContent('h1');
    expect(rows[1]).toHaveTextContent(
      t('audit.files.fromTo', { from: 'src/b.ts', to: 'lib/b.ts' }),
    );
    expect(rows[2]).toHaveTextContent(t('audit.fileAct.deleted'));
    expect(within(rows[0] as HTMLElement).getByText(/2026/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/audit-events?kind=file.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says nothing was done yet, and what will show', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ events: [], nextCursor: null });

    render(<FileFacts />);

    expect(await screen.findByText(t('audit.files.emptyTitle'))).toBeVisible();
    expect(screen.getByText(t('audit.files.emptyDescription'))).toBeVisible();
  });

  it('loads older facts by the cursor it was handed', async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ events: [anEvent('e1', 'file.created', 'a.ts')], nextCursor: '41' })
      .mockResolvedValueOnce({
        events: [anEvent('e0', 'file.copied', 'b.ts', { to: 'c.ts' })],
        nextCursor: null,
      });

    render(<FileFacts />);
    await user.click(await screen.findByRole('button', { name: t('audit.files.loadMore') }));

    expect(
      await screen.findByText(t('audit.files.fromTo', { from: 'b.ts', to: 'c.ts' })),
    ).toBeVisible();
    expect(get).toHaveBeenLastCalledWith('/audit-events?kind=file.&cursor=41');
  });
});

describe('a failure of the facts is theirs alone — S-197', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  it('says it where the facts are, and the trail above carries on', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockImplementation((path: string) =>
      path.startsWith('/audit-events')
        ? Promise.reject(
            new AppError('SERVICE_UNAVAILABLE', 'common.error.unexpected', 'trace-9', {
              retryAfterSeconds: 5,
            }),
          )
        : Promise.resolve({ entries: [], nextCursor: null }),
    );

    mountApp('/audit');

    expect(await screen.findByText(t('audit.list.emptyTitle'))).toBeVisible();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(t('common.error.unexpected'))).toBeVisible();
    expect(
      within(alert).getByText(t('common.error.traceLabel', { traceId: 'trace-9' })),
    ).toBeVisible();
    expect(within(alert).getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });
});
