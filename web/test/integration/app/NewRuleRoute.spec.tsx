import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';

const t = translator('en');

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const SIMULATION = {
  counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
  changes: [],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

const CREATED_RULE = {
  id: 'rule_new',
  scope: 'always',
  kind: 'search',
  toolName: 'search',
  pattern: 'search',
  decision: 'allow',
  projectPath: null,
  engine: null,
  grantedBy: 'auth|42',
  grantedAt: '2026-11-11T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  disabled: null,
  etag: '"etag-1"',
  expiryCeiling: '2027-09-20T10:00:00.000Z',
};

/** The server, only at the `api` boundary — nothing inside the wizard or its steps is mocked, so
 * this proves the whole real stack wires together, from the route down to a Confirm click. */
function mockServer(): void {
  vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
    const p = String(path);
    const input = body as { pattern?: string };

    if (p === '/permission-rules/preview') {
      return Promise.resolve({
        pattern: input.pattern ?? '',
        reach: { kind: 'search', form: 'any', content: null, excludesCompound: false },
        breadth: 'narrow',
        findings: [],
      });
    }
    if (p === '/permission-rules/simulate') {
      return Promise.resolve(SIMULATION);
    }
    if (p === '/permission-rules') {
      return Promise.resolve(CREATED_RULE);
    }
    return Promise.reject(new Error(`unexpected POST ${p}`));
  });
}

describe('/rules/new, mounted through the real router — plan 15, B-27', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the wizard’s first step, behind the same sign-in gate as every other screen', async () => {
    mockServer();

    mountApp('/rules/new');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') }),
    ).toBeVisible();
    expect(screen.getByText(t('rules.wizard.screenPurpose'))).toBeVisible();
  });

  it('runs a whole draft end to end — kind through Confirm — with only the server mocked', async () => {
    mockServer();
    const user = userEvent.setup();
    const routed = mountApp('/rules/new');

    await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') });

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    const decisionGroup = screen.getByRole('radiogroup', {
      name: t('rules.wizard.decisionStepLabel'),
    });
    await user.click(decisionGroup.querySelectorAll('[role="radio"]')[0]!);
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    const folderGroup = screen.getByRole('radiogroup', { name: t('rules.wizard.folderStepLabel') });
    await user.click(folderGroup.querySelectorAll('[role="radio"]')[0]!);
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    await user.click(await screen.findByRole('button', { name: t('rules.wizard.confirm') }));

    // `onCreated` hands off to `useOpenRule`, which is the same `/rules/$ruleId` every other entry
    // point into a rule opens (plan 15, B-21/B-22) — proof the route's own wiring, not just the
    // wizard component in isolation, reaches a real navigation.
    await waitFor(() => {
      expect(routed.path()).toBe('/rules/rule_new');
    });
  });

  it('seeds the draft from a valid search, discarding what it does not recognize — S-192', async () => {
    mockServer();

    mountApp('/rules/new?kind=shell&decision=allow&scope=always&bogus=xyz');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') }),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: t('sessions.kind.shell') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('cancels back to `/rules`, from the wizard’s own first-step Cancel', async () => {
    mockServer();
    const user = userEvent.setup();
    const routed = mountApp('/rules/new');

    await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') });
    await user.click(screen.getByRole('button', { name: t('rules.wizard.cancel') }));

    await waitFor(() => {
      expect(routed.path()).toBe('/rules');
    });
  });

  it('never crashes on a search with nothing valid in it at all', async () => {
    mockServer();

    mountApp('/rules/new?kind=not-a-kind&decision=maybe');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') }),
    ).toBeVisible();
    // Nothing pre-selected on `kind` — the invalid value from the search was discarded, not applied.
    expect(screen.getByRole('button', { name: t('rules.wizard.next') })).toBeDisabled();
  });
});
