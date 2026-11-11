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

/** The server, only at the `api` boundary — nothing inside the panel is mocked (plan 15, B-28). */
function mockServer(evaluation: unknown): void {
  vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
    const p = String(path);

    if (p === '/permission-rules/evaluate') {
      return Promise.resolve(evaluation);
    }
    return Promise.reject(new Error(`unexpected POST ${p}`));
  });
}

describe('/rules/test, mounted through the real router — plan 15, B-28', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the command tester, behind the same sign-in gate as every other screen', async () => {
    mockServer({
      outcome: 'ask',
      answeringRule: null,
      matching: [],
      reasons: ['noRule'],
      caveats: [],
    });

    mountApp('/rules/test');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.test.heading') }),
    ).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: t('rules.test.kindStepLabel') })).toBeVisible();
  });

  it('opens a matching rule from the panel’s own list, through the real route for it', async () => {
    mockServer({
      outcome: 'allow',
      answeringRule: { id: 'rule_match', pattern: 'shell(git status)', decision: 'allow' },
      matching: [{ id: 'rule_match', pattern: 'shell(git status)', decision: 'allow' }],
      reasons: ['ruleAnswers'],
      caveats: [],
    });
    const user = userEvent.setup();
    const routed = mountApp('/rules/test');

    await screen.findByRole('heading', { level: 1, name: t('rules.test.heading') });
    await user.click(screen.getByRole('radio', { name: t('sessions.kind.shell') }));
    await user.type(
      screen.getByRole('textbox', { name: t('rules.wizard.subjectCommand') }),
      'git status',
    );

    await user.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );

    await waitFor(() => {
      expect(routed.path()).toBe('/rules/rule_match');
    });
  });
});
