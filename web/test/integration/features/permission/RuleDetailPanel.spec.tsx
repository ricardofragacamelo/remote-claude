import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RuleDetailPanel } from '@/features/permission';
import { api } from '@/shared/api/api';
import { applyTheme } from '@/shared/hooks/useTheme';
import { render, translator } from '../../../support/render';

const t = translator('en');

const rule = {
  id: 'rule_1',
  scope: 'always',
  kind: 'shell',
  toolName: 'shell',
  pattern: 'shell(git status:*)',
  decision: 'allow',
  projectPath: null,
  engine: null,
  grantedBy: 'auth|42',
  grantedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  disabled: null,
  reach: { kind: 'shell', form: 'prefix', content: 'git status', excludesCompound: false },
  findings: [],
  usage: { count: 3, lastUsedAt: '2026-09-23T10:00:00.000Z', windowDays: 90 },
  grantedVia: 'request',
  etag: '"etag-1"',
  expiryCeiling: '2027-09-20T10:00:00.000Z',
};

const invocation = {
  id: 'entry-1',
  sessionId: 'session-1',
  toolUseId: 'tool-1',
  toolName: 'Bash',
  kind: 'shell',
  input: {},
  decision: 'allowed',
  at: '2026-09-23T10:00:00.000Z',
  traceId: null,
  verdict: null,
};

const historyEvent = {
  id: 'event-1',
  kind: 'permission.ruleGranted',
  at: '2026-09-20T10:00:00.000Z',
  details: null,
};

/** `api.get`, answering the rule, its invocations and its history — by path, as `RulesScreen.spec.tsx` does. */
function mockApiGet(
  options: {
    rule?: unknown;
    invocations?: readonly unknown[];
    events?: readonly unknown[];
  } = {},
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
    const p = String(path);

    if (p.includes('/invocations')) {
      return Promise.resolve({
        invocations: options.invocations ?? [invocation],
        nextCursor: null,
      });
    }

    if (p.includes('/history')) {
      return Promise.resolve({ events: options.events ?? [historyEvent] });
    }

    return Promise.resolve(options.rule ?? rule);
  });
}

describe('the rule detail panel — plan 15, B-22', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while the rule is on its way', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(screen.getByLabelText(t('rules.detail.loading'))).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(error)
      .mockImplementation((path: unknown) => {
        const p = String(path);
        if (p.includes('/invocations'))
          return Promise.resolve({ invocations: [], nextCursor: null });
        if (p.includes('/history')) return Promise.resolve({ events: [] });
        return Promise.resolve(rule);
      });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    await waitFor(() => {
      expect(screen.getByText('shell(git status:*)')).toBeInTheDocument();
    });
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('shows the rule, its sentence, validity, usage, origin and history', async () => {
    mockApiGet();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(await screen.findByText('shell(git status:*)')).toBeInTheDocument();
    expect(screen.getByText(/do `git status`/)).toBeInTheDocument();
    expect(screen.getByText(t('permission.ruleDetail.validityTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('permission.ruleDetail.usageTitle'))).toBeInTheDocument();
    expect(screen.getByText(/auth\|42/)).toBeInTheDocument();
    expect(await screen.findByText(t('permission.ruleHistory.granted'))).toBeInTheDocument();
  });

  it('lists the invocations, each leading to the rule filtered in the trail', async () => {
    mockApiGet();
    const onShowTrail = vi.fn();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={onShowTrail}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.showTrail') }),
    );

    expect(onShowTrail).toHaveBeenCalled();
  });

  it('says there are none, for a rule with no invocations yet', async () => {
    mockApiGet({ invocations: [] });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(
      await screen.findByText(t('permission.ruleDetail.invocationsEmptyTitle')),
    ).toBeInTheDocument();
  });

  it('shows an alert with a finding, and opens the other rule it is about', async () => {
    mockApiGet({
      rule: {
        ...rule,
        findings: [
          {
            kind: 'overlap',
            ruleIds: ['rule_2'],
            messageKey: 'permission.ruleFinding.tooBroad',
            params: {},
          },
        ],
      },
    });
    const onOpenRule = vi.fn();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={onOpenRule}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(await screen.findByText(t('permission.ruleFinding.tooBroad'))).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );

    expect(onOpenRule).toHaveBeenCalledWith('rule_2');
  });

  it('explains a disabled rule, with its translated reason', async () => {
    mockApiGet({
      rule: {
        ...rule,
        kind: null,
        status: 'disabled',
        disabled: null,
        disabledReason: { messageKey: 'common.error.notFound', params: {} },
        expiryCeiling: null,
      },
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('rules.action.revoke') })).toBeNull();
  });

  it('opens the shorten dialog from its own button, applies, and updates the rule shown', async () => {
    mockApiGet();
    vi.spyOn(api, 'patch').mockResolvedValue({ ...rule, expiresAt: '2026-09-27T23:59:59.999Z' });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleExpiry.shortenTitle') }),
    );

    expect(
      screen.getByRole('heading', { name: t('permission.ruleExpiry.shortenTitle') }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: t('permission.ruleExpiry.shortenTitle') }),
      ).toBeNull();
    });
  });

  it('keeps the usage, the findings and the ceiling a shorten’s own bare response never carries', async () => {
    mockApiGet();
    // `PATCH /permission-rules/:ruleId` answers the bare rule (plan 15, B-23) — never
    // `usage`/`findings`/`folderReachable`/`expiryCeiling`, the describe route's own expense
    // (B-22) — unlike every other mock in this file, which spreads the rich fixture and so never
    // catches a regression here.
    vi.spyOn(api, 'patch').mockResolvedValue({
      id: 'rule_1',
      scope: 'always',
      kind: 'shell',
      toolName: 'shell',
      pattern: 'shell(git status:*)',
      decision: 'allow',
      projectPath: null,
      engine: null,
      grantedBy: 'auth|42',
      grantedAt: '2026-09-20T10:00:00.000Z',
      expiresAt: '2026-09-27T23:59:59.999Z',
      status: 'active',
      revokedAt: null,
      disabled: null,
      reach: { kind: 'shell', form: 'prefix', content: 'git status', excludesCompound: false },
      grantedVia: 'request',
      etag: '"etag-2"',
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleExpiry.shortenTitle') }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: t('permission.ruleExpiry.shortenTitle') }),
      ).toBeNull();
    });
    // Still there from the original read — never blanked by the write's own bare answer.
    expect(screen.getByText(t('rules.table.useCount', { count: 3, days: 90 }))).toBeInTheDocument();

    // The ceiling the dialog reads is still a real date — opening Extend next does not crash on
    // a `new Date(undefined)` the way it did before this fix.
    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.extendTitle') }),
    );
    expect(
      screen.getByRole('heading', { name: t('permission.ruleExpiry.extendTitle') }),
    ).toBeInTheDocument();
  });

  it('opens the extend dialog from its own button', async () => {
    mockApiGet();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleExpiry.extendTitle') }),
    );

    expect(
      screen.getByRole('heading', { name: t('permission.ruleExpiry.extendTitle') }),
    ).toBeInTheDocument();
  });

  it('revokes the rule, and disables the button while the write is in flight', async () => {
    mockApiGet();
    vi.spyOn(api, 'delete').mockReturnValue(new Promise(() => undefined));
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    const button = await screen.findByRole('button', { name: t('rules.action.revoke') });
    await userEvent.click(button);

    expect(await screen.findByRole('button', { name: t('rules.action.revoking') })).toBeDisabled();
  });

  it('shows the rule revoked, without a reload, once the write settles', async () => {
    mockApiGet();
    vi.spyOn(api, 'delete').mockResolvedValue({
      ...rule,
      status: 'revoked',
      revokedAt: '2026-09-24T10:00:00.000Z',
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: t('rules.action.revoke') }));

    expect(
      await screen.findByRole('button', { name: t('permission.ruleDetail.restore') }),
    ).toBeInTheDocument();
  });

  it('restores a revoked rule', async () => {
    mockApiGet({ rule: { ...rule, status: 'revoked', revokedAt: '2026-09-23T09:00:00.000Z' } });
    vi.spyOn(api, 'post').mockResolvedValue({
      results: [{ ruleId: 'rule_1', outcome: 'restored' }],
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.restore') }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/permission-rules/restore', { ids: ['rule_1'] });
    });
  });

  it('hands the whole rule to onDuplicate, for the wizard to pre-fill from — B-30', async () => {
    mockApiGet();
    const onDuplicate = vi.fn();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={onDuplicate}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.duplicate') }),
    );

    expect(onDuplicate).toHaveBeenCalledWith(rule);
  });

  it('offers no "duplicate" for a disabled rule — its pattern cannot be translated back', async () => {
    mockApiGet({
      rule: {
        ...rule,
        status: 'disabled',
        disabled: null,
        disabledReason: { messageKey: 'common.error.notFound', params: {} },
      },
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await screen.findByText('shell(git status:*)');
    expect(
      screen.queryByRole('button', { name: t('permission.ruleDetail.duplicate') }),
    ).not.toBeInTheDocument();
  });

  it('offers "simular revogar esta" for an active rule, reading against the trail — S-201', async () => {
    mockApiGet();
    const post = vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      if (String(path).includes('/simulate')) {
        return Promise.resolve({
          counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 1 },
          changes: [],
          withoutFolder: 0,
          assumedMode: 'ask',
        });
      }
      return Promise.reject(new Error(`unexpected POST ${String(path)}`));
    });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(await screen.findByText(t('rules.simulate.revokeHeading')));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/simulate', {
        remove: ['rule_1'],
        limit: 200,
      });
    });
    expect(
      await screen.findByText(
        t('rules.simulate.countsSummary', {
          limit: 200,
          wouldAutoAllow: 0,
          wouldAutoDeny: 0,
          wouldAsk: 1,
          unchanged: 0,
        }),
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it('offers no "simular revogar esta" for a rule that is no longer active', async () => {
    mockApiGet({ rule: { ...rule, status: 'revoked', revokedAt: '2026-09-23T09:00:00.000Z' } });
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await screen.findByText('shell(git status:*)');
    expect(screen.queryByText(t('rules.simulate.revokeHeading'))).not.toBeInTheDocument();
  });

  it('shows the failure, and keeps it beside the rule it was for', async () => {
    mockApiGet();
    const error = {
      code: 'PERMISSION_RULE_NOT_FOUND',
      messageKey: 'permission.error.ruleNotFound',
      params: {},
    };
    vi.spyOn(api, 'delete').mockRejectedValue(error);
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: t('rules.action.revoke') }));

    expect(await screen.findByText(t('permission.error.ruleNotFound'))).toBeInTheDocument();
  });

  it('closes', async () => {
    mockApiGet();
    const onClose = vi.fn();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={onClose}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.close') }),
    );

    expect(onClose).toHaveBeenCalled();
  });

  it('copies the rule’s id on a click of its own button', async () => {
    // `setup()` stands its own clipboard up on the navigator.
    const user = userEvent.setup();
    mockApiGet();
    render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );
    await screen.findByText('shell(git status:*)');

    await user.click(screen.getByRole('button', { name: t('permission.ruleDetail.copyId') }));

    expect(await navigator.clipboard.readText()).toBe('rule_1');
  });

  it('has no axe violations', async () => {
    mockApiGet();
    const { container } = render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );
    await screen.findByText('shell(git status:*)');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the dark theme — S-183', async () => {
    applyTheme('dark');
    mockApiGet();
    const { container } = render(
      <RuleDetailPanel
        ruleId="rule_1"
        onClose={() => {}}
        onOpenRule={() => {}}
        onShowTrail={() => {}}
        onDuplicate={() => {}}
      />,
    );
    await screen.findByText('shell(git status:*)');

    expect(await axe(container)).toHaveNoViolations();
    applyTheme('light');
  });
});
