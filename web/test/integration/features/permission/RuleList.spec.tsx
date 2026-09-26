import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RuleList } from '@/features/permission';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

const NOW = new Date('2026-09-24T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1_000;

/** The date as the row writes it, in the language of the test. */
function shown(iso: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

const alwaysRule = {
  id: 'rule_always',
  scope: 'always',
  toolName: 'Bash',
  pattern: 'Bash(git status)',
  decision: 'allow',
  projectPath: null,
  grantedBy: 'user-1',
  grantedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
};

const projectRule = {
  ...alwaysRule,
  id: 'rule_project',
  scope: 'project',
  toolName: 'Write',
  pattern: 'Write(/srv/app/notes.md)',
  decision: 'deny',
  projectPath: '/srv/app',
};

/** A failure shaped the way `api.ts` hands one on. */
const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

/**
 * The rules screen, through what a person sees and clicks.
 *
 * Every case is one line of docs/architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada
 * or of the F1 matrix: the reach in full, the validity with its warning, the expired rule marked
 * rather than missing, and a revocation that is one click, happens once, and keeps the row when it
 * fails.
 */
describe('the rules screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function answers(...rules: readonly unknown[]): void {
    vi.spyOn(api, 'get').mockResolvedValue({ rules });
  }

  function rowOf(pattern: string): HTMLElement {
    return screen.getByRole('listitem', { name: t('rules.row.label', { pattern }) });
  }

  it('shows the loading state while the rules are on their way', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    render(<RuleList />);

    expect(screen.getByLabelText(t('rules.list.loading'))).toBeInTheDocument();
  });

  it('shows scope, tool, pattern, author, date and validity on every row — S-15', async () => {
    answers(alwaysRule, projectRule);
    render(<RuleList />);

    const always = await screen.findByRole('listitem', {
      name: t('rules.row.label', { pattern: alwaysRule.pattern }),
    });
    expect(within(always).getByText(t('rules.scope.always'))).toBeInTheDocument();
    expect(within(always).getByText(alwaysRule.pattern)).toBeInTheDocument();
    expect(
      within(always).getByText(
        t('rules.row.toolDecision', {
          tool: t('permission.tool.Bash'),
          decision: t('rules.decision.allow'),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      within(always).getByText(
        t('rules.row.granted', { who: 'user-1', at: shown(alwaysRule.grantedAt) }),
      ),
    ).toBeInTheDocument();
    expect(
      within(always).getByText(t('rules.row.validUntil', { at: shown(alwaysRule.expiresAt) })),
    ).toBeInTheDocument();

    // A project rule also says which project — "in this project" means nothing on a list.
    const project = rowOf(projectRule.pattern);
    expect(within(project).getByText(t('rules.scope.project'))).toBeInTheDocument();
    expect(
      within(project).getByText(t('rules.row.project', { path: '/srv/app' })),
    ).toBeInTheDocument();
    expect(
      within(project).getByText(
        t('rules.row.toolDecision', {
          tool: t('permission.tool.Write'),
          decision: t('rules.decision.deny'),
        }),
      ),
    ).toBeInTheDocument();
  });

  it('names a tool it has no words for, rather than a blank', async () => {
    answers({ ...alwaysRule, toolName: 'Glob', pattern: 'Glob(src/**)' });
    render(<RuleList />);

    expect(
      await screen.findByText(
        t('rules.row.toolDecision', {
          tool: t('permission.tool.unknown', { tool: 'Glob' }),
          decision: t('rules.decision.allow'),
        }),
      ),
    ).toBeInTheDocument();
  });

  it('warns about a rule close to expiring, and marks an expired one — S-66', async () => {
    const soon = new Date(NOW.getTime() + 2 * DAY_MS).toISOString();
    answers(
      { ...alwaysRule, expiresAt: soon },
      { ...projectRule, status: 'expired', expiresAt: '2026-09-21T10:00:00.000Z' },
    );
    render(<RuleList />);

    const closing = await screen.findByRole('listitem', {
      name: t('rules.row.label', { pattern: alwaysRule.pattern }),
    });
    expect(
      within(closing).getByText(t('rules.row.expiringSoon', { at: shown(soon) })),
    ).toBeInTheDocument();

    // Still listed: "gone" and "no longer valid" are different things to somebody looking.
    const expired = rowOf(projectRule.pattern);
    expect(within(expired).getByText(t('rules.status.expired'))).toBeInTheDocument();
    expect(
      within(expired).getByText(
        t('rules.row.expiredOn', { at: shown('2026-09-21T10:00:00.000Z') }),
      ),
    ).toBeInTheDocument();
    expect(within(expired).queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains what a rule is when there is none — S-18', async () => {
    answers();
    render(<RuleList />);

    expect(await screen.findByText(t('rules.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('rules.list.emptyDescription'))).toBeInTheDocument();
  });

  it('revokes with one click, and the row leaves — S-16', async () => {
    answers(alwaysRule, projectRule);
    const send = vi.spyOn(api, 'request').mockResolvedValue({ ...alwaysRule, revokedAt: 'now' });
    render(<RuleList />);

    const row = await screen.findByRole('listitem', {
      name: t('rules.row.label', { pattern: alwaysRule.pattern }),
    });
    await userEvent.click(within(row).getByRole('button', { name: t('rules.action.revoke') }));

    expect(send).toHaveBeenCalledWith('/permission-rules/rule_always', { method: 'DELETE' });
    await waitFor(() => {
      expect(screen.queryByText(alwaysRule.pattern)).not.toBeInTheDocument();
    });
    // The other row stays where it was: nothing reloads under the pointer.
    expect(rowOf(projectRule.pattern)).toBeInTheDocument();
  });

  it('revokes once for a double click — S-19', async () => {
    answers(alwaysRule);
    const send = vi.spyOn(api, 'request').mockReturnValue(new Promise(() => undefined));
    render(<RuleList />);

    const row = await screen.findByRole('listitem', {
      name: t('rules.row.label', { pattern: alwaysRule.pattern }),
    });
    await userEvent.dblClick(within(row).getByRole('button', { name: t('rules.action.revoke') }));

    expect(send).toHaveBeenCalledTimes(1);
    expect(within(row).getByRole('button', { name: t('rules.action.revoking') })).toBeDisabled();
  });

  it('keeps the row and says why when revoking fails — S-21', async () => {
    answers(alwaysRule);
    vi.spyOn(api, 'request').mockRejectedValue(unexpected);
    render(<RuleList />);

    const row = await screen.findByRole('listitem', {
      name: t('rules.row.label', { pattern: alwaysRule.pattern }),
    });
    await userEvent.click(within(row).getByRole('button', { name: t('rules.action.revoke') }));

    expect(await within(row).findByRole('alert')).toHaveTextContent(t('common.error.unexpected'));
    // Still there, and still revocable: the rule is still answering, which is what matters.
    expect(within(row).getByRole('button', { name: t('rules.action.revoke') })).toBeEnabled();
  });

  it('shows a rule granted on another device when the list is read again — S-20', async () => {
    answers(alwaysRule);
    const first = render(<RuleList />);
    await screen.findByText(alwaysRule.pattern);
    first.unmount();

    // The phone granted one in the meantime. The list is read, not pushed: a reload is enough.
    answers(alwaysRule, projectRule);
    render(<RuleList />);

    expect(await screen.findByText(projectRule.pattern)).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be read, and recovers with it', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(unexpected)
      .mockResolvedValue({ rules: [alwaysRule] });
    render(<RuleList />);

    await userEvent.click(await screen.findByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText(alwaysRule.pattern)).toBeInTheDocument();
  });

  it('speaks the visitor’s language', async () => {
    answers(alwaysRule);
    render(<RuleList />, 'pt-BR');
    const pt = translator('pt-BR');

    expect(await screen.findByText(pt('rules.scope.always'))).toBeInTheDocument();
    expect(
      screen.getByText(pt('rules.row.validUntil', { at: shown(alwaysRule.expiresAt, 'pt-BR') })),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    answers(alwaysRule, projectRule);
    const { container } = render(<RuleList />);
    await screen.findByText(alwaysRule.pattern);

    expect(await axe(container)).toHaveNoViolations();
  });
});
