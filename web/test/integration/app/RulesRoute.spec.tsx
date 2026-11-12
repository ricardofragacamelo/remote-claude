import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';
import { aViewport } from '../../support/viewport';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const EMPTY_SUMMARY = {
  byStatus: { active: 0, expired: 0, revoked: 0, disabled: 0 },
  byDecision: { allow: 0, deny: 0 },
  byScope: { project: 0, always: 0 },
  expiringBefore: 0,
};

/** `api.get`, answering the listing, the summary and the disabled rules' own listing — by path. */
function mockRules(
  options: {
    rules?: readonly unknown[];
    summary?: typeof EMPTY_SUMMARY;
    disabledRules?: readonly unknown[];
  } = {},
): void {
  vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
    const p = String(path);
    if (p.includes('/permission-rules/summary')) {
      return Promise.resolve(options.summary ?? EMPTY_SUMMARY);
    }
    if (p.includes('status=disabled')) {
      return Promise.resolve({ rules: options.disabledRules ?? [], nextCursor: null });
    }
    return Promise.resolve({ rules: options.rules ?? [], nextCursor: null });
  });
}

/** `/rules`, reached by its link alone — which is what giving it a route is for. */
function mountRules() {
  return mountApp('/rules');
}

describe('the rules route', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', async () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    mountRules();

    expect(await screen.findByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('asks an anonymous visitor to sign in, and never lists anything first', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
    const get = vi.spyOn(api, 'get');

    mountRules();

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('lists the rules of the signed-in visitor, from the link alone', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();

    mountRules();

    expect(await screen.findByText(t('rules.tabEmpty.activeTitle'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('rules.screen.title') })).toBeInTheDocument();
  });

  it('leads back to the workbench, from the navigation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    const mounted = mountRules();

    await user.click(await screen.findByRole('link', { name: t('navigation.entry.workbench') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
  });

  it('lives in its own screen of the frame, its place lit, with its help — S-137', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();

    mountRules();

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.screen.title') }),
    ).toBeVisible();
    expect(screen.getByText(t('rules.screen.purpose'))).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.rules') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: t('help.panel.open') })).toBeVisible();
  });

  const oneRule = {
    id: 'rule_1',
    scope: 'always',
    kind: 'file.write',
    toolName: 'file.write',
    pattern: 'file.write(/workspace/summary.md)',
    engine: null,
    disabled: null,
    decision: 'allow',
    projectPath: null,
    grantedBy: 'auth|42',
    grantedAt: '2026-09-20T10:00:00.000Z',
    expiresAt: '2026-12-19T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    etag: '"etag-1"',
    expiryCeiling: '2027-09-20T10:00:00.000Z',
  };

  const anotherRule = { ...oneRule, id: 'rule_2', pattern: 'shell(git status:*)', kind: 'shell' };

  /** `api.get`, answering a rule by id, its invocations/history, and the list/summary — by path. */
  function mockOneRule(rules: readonly Readonly<Record<string, unknown>>[] = [oneRule]): void {
    vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('/permission-rules/summary')) return Promise.resolve(EMPTY_SUMMARY);
      if (p.includes('/invocations')) {
        return Promise.resolve({
          invocations: [
            {
              id: 'inv-1',
              sessionId: 'session-1',
              toolUseId: 't1',
              toolName: 'Write',
              kind: 'file.write',
              input: {},
              decision: 'allowed',
              at: '2026-09-23T10:00:00.000Z',
              traceId: null,
              verdict: null,
            },
          ],
          nextCursor: null,
        });
      }
      if (p.includes('/history')) return Promise.resolve({ events: [] });
      const matched = rules.find((rule) => p.endsWith(`/${String(rule['id'])}`));
      if (matched !== undefined) return Promise.resolve(matched);
      return Promise.resolve({ rules, nextCursor: null });
    });
  }

  it('opens one rule by its link, over the same list, active, with the way to revoke it — S-137', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();

    mountApp('/rules/rule_1');

    // The panel, with the way to revoke — and the list it opened over, still underneath it.
    expect(await screen.findByRole('button', { name: t('rules.action.revoke') })).toBeVisible();
    expect(screen.getAllByText('file.write(/workspace/summary.md)').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: t('rules.screen.title') })).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.rules') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('closes the rule it opened, back to the bare list, keeping the search — S-222', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();

    const mounted = mountApp('/rules/rule_1?tab=all');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleDetail.close') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules');
    });
    expect(mounted.search()).toMatchObject({ tab: 'all' });
  });

  it('swaps the rule open over the list, from the panel of another finding — S-222', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule([
      {
        ...oneRule,
        findings: [
          {
            kind: 'overlap',
            ruleIds: ['rule_2'],
            messageKey: 'permission.ruleFinding.tooBroad',
            params: {},
          },
        ],
      },
      anotherRule,
    ]);

    const mounted = mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules/rule_2');
    });
    await waitFor(() => {
      expect(screen.getAllByText('shell(git status:*)').length).toBeGreaterThan(0);
    });
  });

  it('opens the trail filtered by the rule, from one of its invocations — S-165', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();

    const mounted = mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.showTrail') }),
    );

    await waitFor(() => {
      expect(mounted.path()).toBe('/audit');
    });
    expect(mounted.search()).toMatchObject({ ruleId: 'rule_1' });
  });

  it('opens the wizard pre-filled, from the detail’s own "Duplicar" — B-30', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();

    const mounted = mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.duplicate') }),
    );

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules/new');
    });
    expect(mounted.search()).toMatchObject({
      pattern: 'file.write(/workspace/summary.md)',
      decision: 'allow',
      scope: 'always',
    });
    expect((mounted.search() as Record<string, unknown>)['folder']).toBeUndefined();
  });

  it('carries the folder along too, duplicating a `project`-scoped rule', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule([{ ...oneRule, scope: 'project', projectPath: '/srv/app' }]);

    const mounted = mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.duplicate') }),
    );

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules/new');
    });
    expect(mounted.search()).toMatchObject({ scope: 'project', folder: '/srv/app' });
  });

  it('opens the rule in a sheet on a phone, with its own way to close it', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();
    const viewport = aViewport('phone');

    mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: t('permission.ruleDetail.close') }),
    ).toBeVisible();

    viewport.desktop();
  });

  it('keeps the rule open while a tab is clicked underneath it, the search updated — S-156', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockOneRule();
    const user = userEvent.setup();
    const mounted = mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await user.click(screen.getByRole('tab', { name: new RegExp(t('rules.tabs.expired')) }));

    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ tab: 'expired' });
    });
    expect(mounted.path()).toBe('/rules/rule_1');
  });

  it('asks for the tab clicked, in the URL’s own search — S-156', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    const mounted = mountRules();
    await screen.findByText(t('rules.tabEmpty.activeTitle'));

    await user.click(screen.getByRole('tab', { name: new RegExp(t('rules.tabs.expired')) }));

    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ tab: 'expired' });
    });
  });

  it('falls back to the default, field by field, for a search that is not well formed — S-156', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();

    const routed = mountApp('/rules?tab=bogus&sort=id&decision=maybe&q=git');

    // `tab` and `decision` were not well formed, and fell back to their own default — `active`,
    // and no decision chip pressed; `q`, well formed, survived the fallback untouched.
    await screen.findByText(t('rules.tabEmpty.activeTitle'));
    expect(screen.getByRole('tab', { name: new RegExp(t('rules.tabs.active')) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: t('rules.decision.allow') })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: t('rules.decision.deny') })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByLabelText(t('rules.filters.search'))).toHaveValue('git');

    // Not just unmatched by any chip: the invalid `decision` must not be sitting unvalidated under
    // `readRulesSearch`'s own result either — `frameRoute` has no `validateSearch` of its own, so
    // TanStack Router's `Object.assign` merge would otherwise let `decision=maybe` leak through
    // untouched had `readRulesSearch` merely omitted the key instead of clearing it outright.
    expect(routed.search()).not.toMatchObject({ decision: 'maybe' });
    expect((routed.search() as Record<string, unknown>)['decision']).toBeUndefined();
  });

  it('opens a rule from its own row, by a double click', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules({
      rules: [
        {
          id: 'rule_1',
          scope: 'always',
          kind: 'shell',
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
        },
      ],
    });
    const user = userEvent.setup();
    const mounted = mountRules();
    const row = await screen.findByText('shell(git status:*)').then((cell) => cell.closest('tr')!);

    await user.dblClick(row);

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules/rule_1');
    });
  });

  it('opens the authoring wizard’s hand-off from the disabled rules banner — S-225', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules({
      summary: {
        byStatus: { active: 0, expired: 0, revoked: 0, disabled: 1 },
        byDecision: { allow: 0, deny: 0 },
        byScope: { project: 0, always: 0 },
        expiringBefore: 0,
      },
      disabledRules: [
        {
          id: 'rule_old',
          scope: 'always',
          kind: null,
          pattern: 'legacy',
          legacyPattern: 'Bash(npm run *)',
          decision: 'allow',
          projectPath: null,
          engine: null,
          grantedBy: 'auth|42',
          grantedAt: '2026-09-20T10:00:00.000Z',
          expiresAt: '2026-12-19T10:00:00.000Z',
          status: 'disabled',
          revokedAt: null,
          disabled: { reason: 'untranslatable' },
          disabledReason: { messageKey: 'common.error.unexpected', params: {} },
        },
      ],
    });
    const user = userEvent.setup();
    const routed = mountRules();

    await user.click(await screen.findByRole('button', { name: t('rules.disabled.open') }));
    await user.click(await screen.findByRole('button', { name: t('rules.disabled.recreate') }));

    // The wizard's own first step (B-27), with the disabled rule's decision and scope carried
    // over — never its untranslatable pattern (S-225).
    await waitFor(() => {
      expect(routed.path()).toBe('/rules/new');
    });
    expect(routed.search()).toMatchObject({ decision: 'allow', scope: 'always' });
    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.wizard.screenTitle') }),
    ).toBeVisible();
  });

  it('opens the wizard, blank, from the screen’s own "New rule" button', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    const routed = mountRules();
    await screen.findByText(t('rules.tabEmpty.activeTitle'));

    await user.click(screen.getByRole('button', { name: t('rules.wizard.newRule') }));

    await waitFor(() => {
      expect(routed.path()).toBe('/rules/new');
    });
  });

  it('opens the command tester from the screen’s own "Testar um comando" button — B-28', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    const routed = mountRules();
    await screen.findByText(t('rules.tabEmpty.activeTitle'));

    await user.click(screen.getByRole('button', { name: t('rules.test.button') }));

    await waitFor(() => {
      expect(routed.path()).toBe('/rules/test');
    });
  });

  it('carries the disabled rule’s folder into the hand-off, for a `project`-scoped one', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules({
      summary: {
        byStatus: { active: 0, expired: 0, revoked: 0, disabled: 1 },
        byDecision: { allow: 0, deny: 0 },
        byScope: { project: 0, always: 0 },
        expiringBefore: 0,
      },
      disabledRules: [
        {
          id: 'rule_old_project',
          scope: 'project',
          kind: null,
          pattern: 'legacy',
          legacyPattern: 'Bash(npm run *)',
          decision: 'deny',
          projectPath: '/srv/app',
          engine: null,
          grantedBy: 'auth|42',
          grantedAt: '2026-09-20T10:00:00.000Z',
          expiresAt: '2026-12-19T10:00:00.000Z',
          status: 'disabled',
          revokedAt: null,
          disabled: { reason: 'untranslatable' },
          disabledReason: { messageKey: 'common.error.unexpected', params: {} },
        },
      ],
    });
    const user = userEvent.setup();
    const routed = mountRules();

    await user.click(await screen.findByRole('button', { name: t('rules.disabled.open') }));
    await user.click(await screen.findByRole('button', { name: t('rules.disabled.recreate') }));

    await waitFor(() => {
      expect(routed.path()).toBe('/rules/new');
    });
    expect(routed.search()).toMatchObject({
      decision: 'deny',
      scope: 'project',
      folder: '/srv/app',
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const { container } = mountRules();
    await screen.findByText(t('rules.tabEmpty.activeTitle'));

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the help of the rules screen — plan 15, B-26', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function heading(key: string): HTMLElement {
    return screen.getByRole('heading', { name: t(key) });
  }

  it('lists every topic — the core ones and what Claude decides before this screen — S-181', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    mountRules();

    await user.click(await screen.findByRole('button', { name: t('help.panel.open') }));

    expect(heading('rules.help.precedenceHeading')).toBeVisible();
    expect(heading('rules.help.scopeHeading')).toBeVisible();
    expect(heading('rules.help.readOnlyHeading')).toBeVisible();
    expect(heading('rules.help.patternHeading')).toBeVisible();
    expect(heading('rules.help.sandboxHeading')).toBeVisible();
    expect(heading('rules.help.recordedHeading')).toBeVisible();
    expect(heading('rules.help.disabledHeading')).toBeVisible();
    expect(heading('rules.export.button')).toBeVisible();
    expect(heading('engines.claude.help.rulesPrecedenceHeading')).toBeVisible();
  });

  it('lists the screen’s own shortcuts, with real keys — S-184', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules();
    const user = userEvent.setup();
    mountRules();

    await user.click(await screen.findByRole('button', { name: t('help.panel.open') }));

    expect(screen.getByText(t('rules.command.revokeSelected'))).toBeVisible();
    expect(screen.getByText(t('rules.command.openExpiringSoon'))).toBeVisible();
  });

  it('"saiba mais" of the disabled rules banner opens the help at the right topic', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    mockRules({
      summary: {
        byStatus: { active: 0, expired: 0, revoked: 0, disabled: 1 },
        byDecision: { allow: 0, deny: 0 },
        byScope: { project: 0, always: 0 },
        expiringBefore: 0,
      },
      disabledRules: [
        {
          id: 'rule_old',
          scope: 'always',
          kind: null,
          pattern: 'legacy',
          legacyPattern: 'Bash(npm run *)',
          decision: 'allow',
          projectPath: null,
          engine: null,
          grantedBy: 'auth|42',
          grantedAt: '2026-09-20T10:00:00.000Z',
          expiresAt: '2026-12-19T10:00:00.000Z',
          status: 'disabled',
          revokedAt: null,
          disabled: { reason: 'untranslatable' },
          disabledReason: { messageKey: 'common.error.unexpected', params: {} },
        },
      ],
    });
    const user = userEvent.setup();
    mountRules();
    await screen.findByText(t('rules.disabled.banner', { count: 1 }));

    await user.click(
      screen.getByRole('button', {
        name: t('help.learnMore.label', { topic: t('rules.disabled.title') }),
      }),
    );

    expect(screen.getByRole('region', { name: t('rules.help.disabledHeading') })).toHaveFocus();
  });

  it('"saiba mais" of a rule\'s own sentence opens the help at the pattern topic', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const rule = {
      id: 'rule_1',
      scope: 'always',
      kind: 'shell',
      pattern: 'shell(git status:*)',
      engine: null,
      disabled: null,
      decision: 'allow',
      projectPath: null,
      grantedBy: 'auth|42',
      grantedAt: '2026-09-20T10:00:00.000Z',
      expiresAt: '2026-12-19T10:00:00.000Z',
      status: 'active',
      revokedAt: null,
      etag: '"etag-1"',
      expiryCeiling: '2027-09-20T10:00:00.000Z',
      reach: { kind: 'shell', form: 'prefix', content: 'git status', excludesCompound: false },
    };
    vi.spyOn(api, 'get').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('/permission-rules/summary')) return Promise.resolve(EMPTY_SUMMARY);
      if (p.includes('/invocations')) return Promise.resolve({ invocations: [], nextCursor: null });
      if (p.includes('/history')) return Promise.resolve({ events: [] });
      if (p.endsWith('/rule_1')) return Promise.resolve(rule);
      return Promise.resolve({ rules: [rule], nextCursor: null });
    });
    const user = userEvent.setup();
    mountApp('/rules/rule_1');
    await screen.findByRole('button', { name: t('rules.action.revoke') });

    await user.click(
      screen.getByRole('button', {
        name: t('help.learnMore.label', { topic: t('rules.help.patternHeading') }),
      }),
    );

    expect(screen.getByRole('region', { name: t('rules.help.patternHeading') })).toHaveFocus();
  });
});
