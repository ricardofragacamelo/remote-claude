import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DEFAULT_RULES_SEARCH, RulesScreen } from '@/features/permission';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';

const t = translator('en');

const DAY_MS = 24 * 60 * 60 * 1_000;

const EMPTY_SUMMARY = {
  byStatus: { active: 0, expired: 0, revoked: 0, disabled: 0 },
  byDecision: { allow: 0, deny: 0 },
  byScope: { project: 0, always: 0 },
  expiringBefore: 0,
};

const alwaysRule = {
  id: 'rule_always',
  scope: 'always',
  kind: 'shell',
  pattern: 'shell(git status:*)',
  decision: 'allow',
  projectPath: null,
  engine: null,
  grantedBy: 'user-1',
  grantedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  disabled: null,
  reach: { kind: 'shell', form: 'prefix', content: 'git status', excludesCompound: false },
  findings: [],
  usage: { count: 14, lastUsedAt: '2026-09-23T10:00:00.000Z', windowDays: 90 },
};

const projectRule = {
  ...alwaysRule,
  id: 'rule_project',
  scope: 'project',
  kind: 'file.write',
  pattern: 'file.write(notes.md)',
  decision: 'deny',
  projectPath: '/srv/app',
  reach: { kind: 'file.write', form: 'exact', content: 'notes.md', excludesCompound: false },
  usage: { count: 0, lastUsedAt: null, windowDays: 90 },
};

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

/** `api.get`, answering the listing, the summary, and the disabled rules' own listing — by path. */
function mockApiGet(
  options: {
    rules?: readonly unknown[];
    summary?: Partial<typeof EMPTY_SUMMARY>;
    disabledRules?: readonly unknown[];
  } = {},
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
    const p = String(path);

    if (p.includes('/permission-rules/summary')) {
      return Promise.resolve({ ...EMPTY_SUMMARY, ...options.summary });
    }

    if (p.includes('status=disabled')) {
      return Promise.resolve({ rules: options.disabledRules ?? [], nextCursor: null });
    }

    return Promise.resolve({ rules: options.rules ?? [], nextCursor: null });
  });
}

/** The row holding a rule's own pattern — the `<tr>` has no accessible name of its own; its text does. */
function rowOf(pattern: string): HTMLElement {
  const cell = screen.getByText(pattern);
  const row = cell.closest('tr');
  if (row === null) {
    throw new Error(`no <tr> around ${pattern}`);
  }
  return row;
}

async function revoke(pattern: string): Promise<void> {
  fireEvent.contextMenu(rowOf(pattern));
  await userEvent.click(await screen.findByRole('menuitem', { name: t('rules.action.revoke') }));
}

describe('the rules screen — plan 15, B-21', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while the rules are on their way — S-159', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(t('rules.table.loading'))).toBeInTheDocument();
  });

  it('explains what to do next when a tab is empty — S-159', async () => {
    mockApiGet();
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    expect(await screen.findByText(t('rules.tabEmpty.activeTitle'))).toBeInTheDocument();
  });

  it('offers a retry when the listing fails, and recovers with it', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
      const p = String(path);
      return p.includes('summary') ? Promise.resolve(EMPTY_SUMMARY) : Promise.reject(unexpected);
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: t('common.action.retry') });
    mockApiGet({ rules: [alwaysRule] });
    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText(alwaysRule.pattern)).toBeInTheDocument();
  });

  it('shows the tabs with the summary’s own counts — S-160', async () => {
    mockApiGet({
      rules: [alwaysRule],
      summary: { byStatus: { active: 3, expired: 1, revoked: 2, disabled: 0 }, expiringBefore: 5 },
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    const tabs = await screen.findByRole('tablist', { name: t('rules.tabs.label') });
    expect(
      within(tabs).getByRole('tab', { name: new RegExp(`${t('rules.tabs.active')}.*3`) }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole('tab', { name: new RegExp(`${t('rules.tabs.expiringSoon')}.*5`) }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole('tab', { name: new RegExp(`${t('rules.tabs.expired')}.*1`) }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole('tab', { name: new RegExp(`${t('rules.tabs.revoked')}.*2`) }),
    ).toBeInTheDocument();
    // "All" sums active, expired and revoked — never the disabled ones (D-02).
    expect(
      within(tabs).getByRole('tab', { name: new RegExp(`${t('rules.tabs.all')}.*6`) }),
    ).toBeInTheDocument();
  });

  it('asks for the tab clicked, leaving the other fields of the search as they were', async () => {
    const onSearch = vi.fn();
    mockApiGet({ rules: [alwaysRule] });
    render(
      <RulesScreen
        search={{ ...DEFAULT_RULES_SEARCH, q: 'git' }}
        onSearch={onSearch}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await userEvent.click(screen.getByRole('tab', { name: new RegExp(t('rules.tabs.expired')) }));

    expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, q: 'git', tab: 'expired' });
  });

  it('shows every column the architecture lists, for an always and a project rule — S-161', async () => {
    mockApiGet({ rules: [alwaysRule, projectRule] });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await screen.findByText(alwaysRule.pattern);
    const always = rowOf(alwaysRule.pattern);
    expect(within(always).getByText(t('rules.decision.allow'))).toBeInTheDocument();
    expect(within(always).getByText(t('sessions.kind.shell'))).toBeInTheDocument();
    expect(within(always).getByText(t('rules.scope.always'))).toBeInTheDocument();
    expect(
      within(always).getByText(t('rules.table.useCount', { count: 14, days: 90 })),
    ).toBeInTheDocument();

    const project = await screen
      .findByText(projectRule.pattern)
      .then((cell) => cell.closest('tr')!);
    expect(within(project).getByText(t('rules.decision.deny'))).toBeInTheDocument();
    expect(within(project).getByText(t('sessions.kind.fileWrite'))).toBeInTheDocument();
  });

  it('reads an `mcp` rule’s server and tool apart, from its own reach — S-162', async () => {
    mockApiGet({
      rules: [
        {
          ...alwaysRule,
          id: 'rule_mcp',
          kind: 'mcp',
          pattern: 'mcp(github:create_issue)',
          reach: {
            kind: 'mcp',
            form: 'exact',
            content: 'github:create_issue',
            excludesCompound: false,
          },
        },
      ],
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await screen.findByText('mcp(github:create_issue)');
    expect(
      screen.getByText(t('rules.table.mcpServerTool', { server: 'github', tool: 'create_issue' })),
    ).toBeInTheDocument();
  });

  it('names a kind it has no words for generically, with the pattern as text beside it — S-162', async () => {
    mockApiGet({
      rules: [
        {
          ...alwaysRule,
          id: 'rule_new',
          kind: 'vcs.commit',
          pattern: 'vcs.commit(abc)',
          reach: null,
        },
      ],
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    const row = await screen.findByText('vcs.commit(abc)').then((cell) => cell.closest('tr')!);
    expect(within(row).getByText(t('sessions.kind.other'))).toBeInTheDocument();
  });

  it('flags a rule with a finding — S-161', async () => {
    mockApiGet({
      rules: [{ ...alwaysRule, findings: [{ kind: 'shadowedByDeny', ruleId: 'other' }] }],
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await screen.findByText(alwaysRule.pattern);
    const row = rowOf(alwaysRule.pattern);
    expect(
      await within(row).findByLabelText(t('rules.table.hasAlert', { count: 1 })),
    ).toBeInTheDocument();
  });

  it('revokes with one click, and the row leaves — regression of plan 03 S-16', async () => {
    mockApiGet({ rules: [alwaysRule, projectRule] });
    const send = vi.spyOn(api, 'request').mockResolvedValue({ ...alwaysRule, status: 'revoked' });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await revoke(alwaysRule.pattern);

    expect(send).toHaveBeenCalledWith('/permission-rules/rule_always', { method: 'DELETE' });
    await waitFor(() => {
      expect(screen.queryByText(alwaysRule.pattern)).not.toBeInTheDocument();
    });
    // The other row stays where it was: nothing reloads under the pointer.
    expect(screen.getByText(projectRule.pattern)).toBeInTheDocument();
  });

  it('revokes once for a double click — regression of plan 03 S-19', async () => {
    mockApiGet({ rules: [alwaysRule] });
    const send = vi.spyOn(api, 'request').mockReturnValue(new Promise(() => undefined));
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await revoke(alwaysRule.pattern);
    await revoke(alwaysRule.pattern);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the row and says why when revoking fails — regression of plan 03 S-21', async () => {
    mockApiGet({ rules: [alwaysRule] });
    vi.spyOn(api, 'request').mockRejectedValue(unexpected);
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await revoke(alwaysRule.pattern);

    expect(await screen.findByRole('alert')).toHaveTextContent(t('common.error.unexpected'));
    expect(screen.getByText(alwaysRule.pattern)).toBeInTheDocument();
    // Still revocable: the row's own menu offers it again, since the rule still answers.
    fireEvent.contextMenu(rowOf(alwaysRule.pattern));
    expect(
      await screen.findByRole('menuitem', { name: t('rules.action.revoke') }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('asks for the new sort on a click of a sortable column not yet sorted by', async () => {
    const onSearch = vi.fn();
    mockApiGet({ rules: [alwaysRule] });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={onSearch}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('rules.table.columnPattern')) }),
    );

    expect(onSearch).toHaveBeenCalledWith({
      ...DEFAULT_RULES_SEARCH,
      sort: 'pattern',
      order: 'desc',
    });
  });

  it('reverses the order on a click of the column already sorted by', async () => {
    const onSearch = vi.fn();
    mockApiGet({ rules: [alwaysRule] });
    render(
      <RulesScreen
        search={{ ...DEFAULT_RULES_SEARCH, sort: 'pattern', order: 'desc' }}
        onSearch={onSearch}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('rules.table.columnPattern')) }),
    );

    expect(onSearch).toHaveBeenCalledWith({
      ...DEFAULT_RULES_SEARCH,
      sort: 'pattern',
      order: 'asc',
    });
  });

  it('shows the migration’s disabled rules, with the old pattern and the way to recreate — S-225', async () => {
    const onRecreate = vi.fn();
    mockApiGet({
      rules: [alwaysRule],
      summary: { byStatus: { active: 1, expired: 0, revoked: 0, disabled: 2 } },
      disabledRules: [
        {
          ...alwaysRule,
          id: 'rule_old',
          kind: null,
          pattern: 'legacy',
          legacyPattern: 'Bash(npm run *)',
          status: 'disabled',
          disabledReason: { messageKey: 'common.error.unexpected', params: {} },
          reach: null,
        },
      ],
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={onRecreate}
      />,
    );

    expect(await screen.findByText(t('rules.disabled.banner', { count: 2 }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('rules.disabled.open') }));

    expect(await screen.findByText('Bash(npm run *)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('rules.disabled.recreate') }));
    expect(onRecreate).toHaveBeenCalledWith({ decision: 'allow', scope: 'always', folder: null });
  });

  it('hides the banner when nothing was disabled — S-225', async () => {
    mockApiGet({ rules: [alwaysRule] });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await screen.findByText(alwaysRule.pattern);
    expect(
      screen.queryByRole('button', { name: t('rules.disabled.open') }),
    ).not.toBeInTheDocument();
  });

  it('moves the focus with arrows and opens the focused row with Enter — S-168', async () => {
    const onOpenRule = vi.fn();
    mockApiGet({ rules: [alwaysRule, projectRule] });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={onOpenRule}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    const grid = screen.getByRole('grid');
    grid.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onOpenRule).toHaveBeenCalledWith(alwaysRule.id);
  });

  it('revokes the focused row on Delete — S-168', async () => {
    mockApiGet({ rules: [alwaysRule] });
    const send = vi.spyOn(api, 'request').mockResolvedValue({ ...alwaysRule, status: 'revoked' });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    screen.getByRole('grid').focus();
    await userEvent.keyboard('{ArrowDown}{Delete}');

    expect(send).toHaveBeenCalledWith('/permission-rules/rule_always', { method: 'DELETE' });
  });

  it('shows the table as a list of cards below `md`, with no column header — S-167', async () => {
    const viewport = aViewport('phone');
    mockApiGet({ rules: [alwaysRule] });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    expect(await screen.findByText(alwaysRule.pattern)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    viewport.desktop();
  });

  it('speaks the visitor’s language', async () => {
    mockApiGet({ rules: [alwaysRule] });
    const pt = translator('pt-BR');
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
      'pt-BR',
    );

    expect(await screen.findByText(pt('rules.scope.always'))).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    mockApiGet({ rules: [alwaysRule, projectRule] });
    const { container } = render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );
    await screen.findByText(alwaysRule.pattern);

    expect(await axe(container)).toHaveNoViolations();
  });

  describe('the filters — plan 15, B-21', () => {
    it('asks for a decision on a click of its chip', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.decision.allow') }));

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, decision: 'allow' });
    });

    it('clears a decision on a second click of the same chip', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, decision: 'allow' }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.decision.allow') }));

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });

    it('asks for a scope on a click of its chip, and clears it the same way', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.scope.project') }));

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, scope: 'project' });
    });

    it('asks for a kind from the select, built from the rules on the page', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule, projectRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.selectOptions(screen.getByLabelText(t('rules.filters.kind')), 'file.write');

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, kind: 'file.write' });
    });

    it('asks for a folder from the select, built from the rules on the page', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule, projectRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.selectOptions(screen.getByLabelText(t('rules.filters.folder')), '/srv/app');

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, folder: '/srv/app' });
    });

    it('asks for "com alerta" on a click of its chip', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.filters.withAlert') }));

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, withAlert: true });
    });

    it('asks for the text typed in the search box on submit', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.type(screen.getByLabelText(t('rules.filters.search')), 'git status');
      await userEvent.click(screen.getByRole('button', { name: t('rules.filters.apply') }));

      expect(onSearch).toHaveBeenCalledWith({ ...DEFAULT_RULES_SEARCH, q: 'git status' });
    });

    it('narrows to only rules with a finding when "com alerta" is on — client-side (D-13)', async () => {
      mockApiGet({
        rules: [
          alwaysRule,
          { ...projectRule, findings: [{ kind: 'shadowedByDeny', ruleId: 'other' }] },
        ],
      });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, withAlert: true }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      expect(await screen.findByText(projectRule.pattern)).toBeInTheDocument();
      expect(screen.queryByText(alwaysRule.pattern)).not.toBeInTheDocument();
    });

    it('narrows the "Perto de expirar" tab to only the rules within the seven-day window — D-13', async () => {
      const NOW = new Date('2026-09-24T12:00:00.000Z');
      vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
      const soon = new Date(NOW.getTime() + 2 * DAY_MS).toISOString();
      mockApiGet({ rules: [{ ...alwaysRule, expiresAt: soon }, projectRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, tab: 'expiringSoon' }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      expect(await screen.findByText(alwaysRule.pattern)).toBeInTheDocument();
      expect(screen.queryByText(projectRule.pattern)).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe('every rendering of a row — S-161', () => {
    it('shows no validity for a disabled rule, and never offers to revoke it', async () => {
      mockApiGet({
        rules: [
          {
            ...alwaysRule,
            id: 'rule_disabled',
            kind: null,
            status: 'disabled',
            pattern: 'legacy',
            legacyPattern: 'Bash(npm run *)',
            reach: null,
            usage: null,
          },
        ],
        summary: { byStatus: { active: 0, expired: 0, revoked: 0, disabled: 0 } },
      });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, tab: 'all' }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      const row = await screen.findByText('legacy').then((cell) => cell.closest('tr')!);
      expect(within(row).getAllByText(t('rules.table.notApplicable'))).toHaveLength(2);

      fireEvent.contextMenu(row);
      expect(
        await screen.findByRole('menuitem', { name: t('rules.action.revoke') }),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('says "never" for a rule with no usage yet', async () => {
      mockApiGet({ rules: [projectRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      const row = await screen.findByText(projectRule.pattern).then((cell) => cell.closest('tr')!);
      expect(within(row).getByText(t('rules.table.never'))).toBeInTheDocument();
    });

    it('never offers to revoke an already-revoked rule', async () => {
      mockApiGet({
        rules: [{ ...alwaysRule, status: 'revoked', revokedAt: '2026-09-22T00:00:00.000Z' }],
      });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, tab: 'revoked' }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      const row = await screen.findByText(alwaysRule.pattern).then((cell) => cell.closest('tr')!);

      fireEvent.contextMenu(row);
      expect(
        await screen.findByRole('menuitem', { name: t('rules.action.open') }),
      ).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: t('rules.action.revoke') })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('opens the rule from the row’s own menu', async () => {
      const onOpenRule = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={onOpenRule}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      fireEvent.contextMenu(rowOf(alwaysRule.pattern));
      await userEvent.click(await screen.findByRole('menuitem', { name: t('rules.action.open') }));

      expect(onOpenRule).toHaveBeenCalledWith(alwaysRule.id);
    });
  });

  describe('the card list below `md` — S-167', () => {
    it('opens and revokes a rule from its own buttons', async () => {
      const onOpenRule = vi.fn();
      const viewport = aViewport('phone');
      mockApiGet({ rules: [alwaysRule] });
      const send = vi.spyOn(api, 'request').mockResolvedValue({ ...alwaysRule, status: 'revoked' });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={onOpenRule}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      const card = screen.getByText(alwaysRule.pattern).closest('li')!;
      await userEvent.click(within(card).getByRole('button', { name: t('rules.action.open') }));
      expect(onOpenRule).toHaveBeenCalledWith(alwaysRule.id);

      await userEvent.click(within(card).getByRole('button', { name: t('rules.action.revoke') }));
      expect(send).toHaveBeenCalledWith('/permission-rules/rule_always', { method: 'DELETE' });
      viewport.desktop();
    });

    it('offers no revoke button for a revoked rule', async () => {
      const viewport = aViewport('phone');
      mockApiGet({
        rules: [{ ...alwaysRule, status: 'revoked', revokedAt: '2026-09-22T00:00:00.000Z' }],
      });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, tab: 'revoked' }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      const card = screen.getByText(alwaysRule.pattern).closest('li')!;
      expect(
        within(card).queryByRole('button', { name: t('rules.action.revoke') }),
      ).not.toBeInTheDocument();
      viewport.desktop();
    });

    it('disables its own revoke button, and says why it failed', async () => {
      const viewport = aViewport('phone');
      mockApiGet({ rules: [alwaysRule] });
      vi.spyOn(api, 'request').mockRejectedValue(unexpected);
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      const card = screen.getByText(alwaysRule.pattern).closest('li')!;
      await userEvent.click(within(card).getByRole('button', { name: t('rules.action.revoke') }));

      expect(await within(card).findByRole('alert')).toHaveTextContent(
        t('common.error.unexpected'),
      );
      viewport.desktop();
    });

    it('moves and shows the keyboard’s own focus on a card', async () => {
      const viewport = aViewport('phone');
      mockApiGet({ rules: [alwaysRule, projectRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      screen.getByRole('listbox').focus();
      await userEvent.keyboard('{ArrowDown}');

      expect(screen.getByText(alwaysRule.pattern).closest('li')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      viewport.desktop();
    });
  });

  describe('a rule’s own pattern cell', () => {
    it('copies the pattern on a click of its own button', async () => {
      // `setup()` stands its own clipboard up on the navigator.
      const user = userEvent.setup();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await user.click(screen.getByRole('button', { name: t('rules.table.copyPattern') }));

      expect(await navigator.clipboard.readText()).toBe(alwaysRule.pattern);
    });
  });

  describe('a rule’s own folder, with no segment after the last slash', () => {
    it('falls back to the full path', async () => {
      mockApiGet({ rules: [{ ...projectRule, projectPath: '/' }] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      const row = await screen.findByText(projectRule.pattern).then((cell) => cell.closest('tr')!);
      expect(within(row).getByText('/')).toBeInTheDocument();
    });
  });

  describe('sorting, ascending', () => {
    it('shows the ascending arrow and `aria-sort` on the sorted column', async () => {
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, sort: 'pattern', order: 'asc' }}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      expect(
        screen.getByRole('columnheader', { name: new RegExp(t('rules.table.columnPattern')) }),
      ).toHaveAttribute('aria-sort', 'ascending');
    });
  });

  describe('a row’s other interactions', () => {
    it('opens the rule on a double click of its own row', async () => {
      const onOpenRule = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={onOpenRule}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.dblClick(rowOf(alwaysRule.pattern));

      expect(onOpenRule).toHaveBeenCalledWith(alwaysRule.id);
    });

    it('selects a row from its own checkbox', async () => {
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      const checkbox = screen.getByLabelText(
        t('rules.table.rowSelect', { pattern: alwaysRule.pattern }),
      );
      await userEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it('shows no alert icon for a rule the route never filled `findings` in for', async () => {
      mockApiGet({ rules: [{ ...alwaysRule, findings: undefined }] });
      render(
        <RulesScreen
          search={DEFAULT_RULES_SEARCH}
          onSearch={vi.fn()}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );

      const row = await screen.findByText(alwaysRule.pattern).then((cell) => cell.closest('tr')!);
      expect(within(row).queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('clearing a filter on a second interaction', () => {
    it('clears the scope', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [projectRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, scope: 'project' }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(projectRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.scope.project') }));

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });

    it('clears the kind', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [projectRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, kind: 'file.write' }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(projectRule.pattern);

      await userEvent.selectOptions(screen.getByLabelText(t('rules.filters.kind')), '');

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });

    it('clears the folder', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [projectRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, folder: '/srv/app' }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(projectRule.pattern);

      await userEvent.selectOptions(screen.getByLabelText(t('rules.filters.folder')), '');

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });

    it('clears "com alerta"', async () => {
      const onSearch = vi.fn();
      mockApiGet({
        rules: [{ ...alwaysRule, findings: [{ kind: 'shadowedByDeny', ruleId: 'other' }] }],
      });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, withAlert: true }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.click(screen.getByRole('button', { name: t('rules.filters.withAlert') }));

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });

    it('clears the search text on an empty submit', async () => {
      const onSearch = vi.fn();
      mockApiGet({ rules: [alwaysRule] });
      render(
        <RulesScreen
          search={{ ...DEFAULT_RULES_SEARCH, q: 'git' }}
          onSearch={onSearch}
          onOpenRule={vi.fn()}
          onRecreate={vi.fn()}
        />,
      );
      await screen.findByText(alwaysRule.pattern);

      await userEvent.clear(screen.getByLabelText(t('rules.filters.search')));
      await userEvent.click(screen.getByRole('button', { name: t('rules.filters.apply') }));

      expect(onSearch).toHaveBeenCalledWith(DEFAULT_RULES_SEARCH);
    });
  });

  it('offers a retry, within the disabled rules’ own list, when reading it fails', async () => {
    vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('summary')) {
        return Promise.resolve({
          ...EMPTY_SUMMARY,
          byStatus: { active: 0, expired: 0, revoked: 0, disabled: 1 },
        });
      }
      if (p.includes('status=disabled')) {
        return Promise.reject(unexpected);
      }
      return Promise.resolve({ rules: [], nextCursor: null });
    });
    render(
      <RulesScreen
        search={DEFAULT_RULES_SEARCH}
        onSearch={vi.fn()}
        onOpenRule={vi.fn()}
        onRecreate={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: t('rules.disabled.open') }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
