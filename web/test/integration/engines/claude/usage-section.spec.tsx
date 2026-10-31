import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import { backendAnswers } from '../../../support/claude-settings';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};
const unavailable = () =>
  Promise.reject(new AppError('AGENT_UNAVAILABLE', 'session.error.agentUnavailable', 't1'));

/** A rate-limit window with every optional field present, overridable per scenario. */
function windowOf(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    kind: 'five_hour',
    status: 'allowed',
    utilizationPercent: 8,
    resetsAt: '2026-11-02T00:00:00.000Z',
    observedAt: '2026-10-26T12:00:00.000Z',
    ...overrides,
  };
}

describe("Claude's own usage section — the account's rate-limit windows (plan 16, D-09)", () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no reading yet when nothing has been observed — the state a fresh backend starts in', async () => {
    backendAnswers({ '/engines/claude/usage/rate-limits': () => Promise.resolve({ windows: [] }) });
    mountApp('/settings/agents/claude?section=usage');

    expect(await screen.findByText(t('engines.claude.usage.noneTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.usage.noneBody'))).toBeVisible();
  });

  it('shows the known windows, ordered, each with its label, status, percent and progress bar', async () => {
    backendAnswers({
      '/engines/claude/usage/rate-limits': () =>
        Promise.resolve({
          windows: [
            windowOf({ kind: 'seven_day', status: 'rejected', utilizationPercent: 100 }),
            windowOf({ kind: 'five_hour', status: 'allowed', utilizationPercent: 8 }),
          ],
        }),
    });
    mountApp('/settings/agents/claude?section=usage');

    const bars = await screen.findAllByRole('progressbar');
    expect(bars).toHaveLength(2);
    // Session (5 h) sorts before Weekly (7 days) regardless of the order the backend answered in.
    expect(bars[0]).toHaveAccessibleName(t('engines.claude.usage.windowFiveHour'));
    expect(bars[1]).toHaveAccessibleName(t('engines.claude.usage.windowSevenDay'));
    expect(bars[0]).toHaveAttribute('aria-valuenow', '8');
    expect(bars[1]?.parentElement).toHaveTextContent(t('engines.claude.usage.statusRejected'));
    expect(screen.getByText(/Seen/)).toBeVisible();
  });

  it('shows a per-model window by its own server-given name, never translated, and when it resets', async () => {
    backendAnswers({
      '/engines/claude/usage/rate-limits': () =>
        Promise.resolve({
          windows: [windowOf({ kind: 'model_scoped_fable', displayName: 'Fable' })],
        }),
    });
    mountApp('/settings/agents/claude?section=usage');

    expect(await screen.findByText('Fable')).toBeVisible();
    expect(screen.getByText(/Resets/)).toBeVisible();
  });

  it('falls back to the raw kind, sorted after every known window and alphabetically among themselves, for ones this build does not label', async () => {
    backendAnswers({
      '/engines/claude/usage/rate-limits': () =>
        Promise.resolve({
          windows: [
            windowOf({ kind: 'z_future_window' }),
            windowOf({ kind: 'a_future_window' }),
            windowOf({ kind: 'five_hour' }),
          ],
        }),
    });
    mountApp('/settings/agents/claude?section=usage');

    const bars = await screen.findAllByRole('progressbar');
    expect(bars[0]).toHaveAccessibleName(t('engines.claude.usage.windowFiveHour'));
    expect(bars[1]).toHaveAccessibleName('a_future_window');
    expect(bars[2]).toHaveAccessibleName('z_future_window');
  });

  it('shows no reading, and no percent on the bar, for a window the probe could not read a utilization of', async () => {
    backendAnswers({
      '/engines/claude/usage/rate-limits': () =>
        Promise.resolve({ windows: [windowOf({ utilizationPercent: null, resetsAt: null })] }),
    });
    mountApp('/settings/agents/claude?section=usage');

    expect(await screen.findByText(t('engines.claude.usage.noReading'))).toBeVisible();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/Resets/)).not.toBeInTheDocument();
  });

  it('keeps the place while loading, and says why and offers to retry when it fails', async () => {
    backendAnswers({ '/engines/claude/usage/rate-limits': unavailable });
    mountApp('/settings/agents/claude?section=usage');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('session.error.agentUnavailable'));
    expect(screen.getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });

  it('reads the windows again on retry after a failure, and again when asked to refresh', async () => {
    const user = userEvent.setup();
    let fails = true;
    const get = backendAnswers({
      '/engines/claude/usage/rate-limits': () =>
        fails ? unavailable() : Promise.resolve({ windows: [windowOf()] }),
    });
    mountApp('/settings/agents/claude?section=usage');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);
    expect(await screen.findByRole('progressbar')).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('engines.claude.usage.refresh') }));
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/engines/claude/usage/rate-limits');
    });
  });
});
