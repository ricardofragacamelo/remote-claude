import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RuleDetail } from '@/features/permission';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');
const NOW = new Date('2026-09-24T12:00:00.000Z');

const rule = {
  id: 'rule_1',
  scope: 'always',
  toolName: 'Bash',
  pattern: 'Bash(git status)',
  decision: 'allow',
  projectPath: null,
  grantedBy: 'auth|42',
  grantedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
};

const revokedAt = '2026-09-23T09:00:00.000Z';
const shown = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));

/**
 * One rule, opened from the trail entry it answered — plan 03, F2, B-15.
 *
 * The promise of D-04 is that the rule opens "even when it was already revoked, and then the
 * screen explains the state": that is what these cases hold it to.
 */
describe('the screen of one rule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the loading state while the rule is on its way', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    render(<RuleDetail ruleId="rule_1" />);

    expect(screen.getByLabelText(t('rules.detail.loading'))).toBeInTheDocument();
  });

  it('explains a revoked rule, and offers nothing to take back — S-50', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ ...rule, status: 'revoked', revokedAt });
    render(<RuleDetail ruleId="rule_1" />);

    expect(
      await screen.findByText(t('rules.row.revokedOn', { at: shown(revokedAt) })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('rules.status.revoked'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('rules.action.revoke') })).toBeNull();
  });

  it('revokes an active rule right here, and then explains it — one click from the trail', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(rule);
    const send = vi
      .spyOn(api, 'request')
      .mockResolvedValue({ ...rule, status: 'revoked', revokedAt: NOW.toISOString() });
    render(<RuleDetail ruleId="rule_1" />);

    await userEvent.click(await screen.findByRole('button', { name: t('rules.action.revoke') }));

    expect(
      await screen.findByText(t('rules.row.revokedOn', { at: shown(NOW.toISOString()) })),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('/permission-rules/rule_1', { method: 'DELETE' });
  });

  it('keeps the rule when revoking fails, with the reason beside it', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(rule);
    vi.spyOn(api, 'request').mockRejectedValue({
      code: 'INTERNAL_ERROR',
      messageKey: 'common.error.unexpected',
      params: {},
      traceId: 't',
    });
    render(<RuleDetail ruleId="rule_1" />);

    await userEvent.click(await screen.findByRole('button', { name: t('rules.action.revoke') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('common.error.unexpected'));
    expect(screen.getByText(t('rules.status.active'))).toBeInTheDocument();
  });

  it('says so, translated, when the rule is somebody else`s — S-74', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({
      code: 'PERMISSION_NOT_OWNED',
      messageKey: 'permission.error.ruleNotOwned',
      params: {},
      traceId: 't',
    });
    render(<RuleDetail ruleId="rule_1" />);

    expect(await screen.findByText(t('permission.error.ruleNotOwned'))).toBeInTheDocument();
  });
});
