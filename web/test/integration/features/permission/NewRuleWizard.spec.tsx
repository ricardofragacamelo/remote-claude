import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { NewRuleWizard } from '@/features/permission/components/NewRuleWizard';
import type { NewRuleSearch } from '@/features/permission/lib/new-rule-search';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const SIMULATION = {
  counts: { unchanged: 1, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
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

/** The server mocked loosely enough to let any draft through this wizard's own orchestration
 * reach `review` — the width gate and the findings are `NewRuleReviewStep`'s own scope, already
 * proven in its own spec; here `breadth` is always `narrow` so navigation is never blocked by it. */
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

function emptySearch(): NewRuleSearch {
  return {};
}

/** `RuleWizardOption`'s accessible name is its whole button text — title and body concatenated
 * with no separator for a two-line option (decision, scope) — so picking by position inside its
 * own named `radiogroup` is the sturdy way to reach "Allow" or "Always", first and second in the
 * order the step itself renders them. */
function radioAt(groupName: string, index: number): HTMLElement {
  const group = screen.getByRole('radiogroup', { name: groupName });
  const radios = within(group).getAllByRole('radio');
  const radio = radios[index];
  if (radio === undefined) {
    throw new Error(`no radio at index ${index} of "${groupName}" (${radios.length} found)`);
  }
  return radio;
}

function allowRadio(): HTMLElement {
  return radioAt(t('rules.wizard.decisionStepLabel'), 0);
}

function alwaysScopeRadio(): HTMLElement {
  return radioAt(t('rules.wizard.folderStepLabel'), 0);
}

function mount(initial: NewRuleSearch = emptySearch()) {
  mockServer();
  const onCancel = vi.fn();
  const onCreated = vi.fn();
  const onOpenRule = vi.fn();
  const mounted = render(
    <NewRuleWizard
      initial={initial}
      onCancel={onCancel}
      onCreated={onCreated}
      onOpenRule={onOpenRule}
    />,
  );
  return { ...mounted, onCancel, onCreated, onOpenRule };
}

describe('step to step, start to finish — plan 15, B-27', () => {
  it('starts on kind, with Cancel in place of Back', async () => {
    const { onCancel } = mount();
    const user = userEvent.setup();

    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepKind') })),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('rules.wizard.next') })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: t('rules.wizard.cancel') }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('walks forward through every step to review, and back again to kind', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepPattern') })),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepDecision') })),
    ).toBeInTheDocument();

    await user.click(allowRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepFolder') })),
    ).toBeInTheDocument();

    await user.click(alwaysScopeRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepValidity') })),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    expect(
      await screen.findByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepReview') })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('rules.wizard.next') })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('rules.wizard.back') }));
    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepValidity') })),
    ).toBeInTheDocument();
  });

  it('creates the rule from review, calling onCreated with the server’s own answer', async () => {
    const { onCreated } = mount();
    const user = userEvent.setup();

    await advanceToReview(user);
    await user.click(await screen.findByRole('button', { name: t('rules.wizard.confirm') }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule_new' }));
    });
  });
});

/** Kind, pattern, decision, folder, validity — every step `review` needs filled in, with
 * `search` so the pattern step needs nothing typed (shared by every test that only cares what
 * `review` itself does once it is reached). */
async function advanceToReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
  await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
  await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
  await user.click(allowRadio());
  await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
  await user.click(alwaysScopeRadio());
  await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
  await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));
  await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
}

describe('the review step’s own preview — fetched by the wizard, under the real decision and scope', () => {
  it('shows the server’s own translated error when the review preview fails', async () => {
    vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p === '/permission-rules/preview') {
        return Promise.reject({
          messageKey: 'permission.error.patternInvalid',
          params: { pattern: 'search' },
        });
      }
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    const onCancel = vi.fn();
    const onCreated = vi.fn();
    const onOpenRule = vi.fn();
    render(
      <NewRuleWizard
        initial={emptySearch()}
        onCancel={onCancel}
        onCreated={onCreated}
        onOpenRule={onOpenRule}
      />,
    );
    const user = userEvent.setup();

    await advanceToReview(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('permission.error.patternInvalid', { pattern: 'search' }),
    );
    expect(
      screen.queryByRole('button', { name: t('rules.wizard.confirm') }),
    ).not.toBeInTheDocument();
  });

  it('sends a refused folder back to the folder step, from the wizard’s own handling — S-195', async () => {
    vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p === '/permission-rules/preview') {
        return Promise.resolve({
          pattern: 'search',
          reach: { kind: 'search', form: 'any', content: null, excludesCompound: false },
          breadth: 'narrow',
          findings: [],
        });
      }
      if (p === '/permission-rules/simulate') {
        return Promise.resolve(SIMULATION);
      }
      if (p === '/permission-rules') {
        return Promise.reject({
          code: 'WORKSPACE_NOT_ALLOWED',
          messageKey: 'workspace.error.notAllowed',
          params: {},
        });
      }
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    render(
      <NewRuleWizard
        initial={emptySearch()}
        onCancel={vi.fn()}
        onCreated={vi.fn()}
        onOpenRule={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await advanceToReview(user);
    await user.click(await screen.findByRole('button', { name: t('rules.wizard.confirm') }));

    await waitFor(() => {
      expect(
        screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepFolder') })),
      ).toBeInTheDocument();
    });
  });
});

describe('a `project`-scoped draft, with a folder chosen', () => {
  it('sends `projectPath` in the review’s own preview once a folder is chosen', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    const preview = vi.fn();
    vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
      const p = String(path);
      const input = body as { pattern?: string };
      if (p === '/permission-rules/preview') {
        preview(input);
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
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    render(
      <NewRuleWizard
        initial={emptySearch()}
        onCancel={vi.fn()}
        onCreated={vi.fn()}
        onOpenRule={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(allowRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    await user.click(screen.getByRole('radio', { name: t('rules.scope.project') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('rules.wizard.folderDialogTitle'),
    });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    await waitFor(() => {
      expect(preview).toHaveBeenCalledWith(expect.objectContaining({ projectPath: projects.path }));
    });
  });
});

describe('a seeded draft — S-192, S-225', () => {
  it('starts on kind still, with the hand-off’s own fields already picked', async () => {
    mount({ kind: 'shell', decision: 'allow', scope: 'always' });
    const user = userEvent.setup();

    expect(
      screen.getByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepKind') })),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t('sessions.kind.shell') })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Past `kind`, to `pattern` — a subject-shaped kind with nothing typed never completes on its
    // own (S-192's own contract never seeds the untranslatable pattern, only decision/scope/folder).
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.type(screen.getByLabelText(t('rules.wizard.subjectCommand')), 'status');
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    expect(allowRadio()).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    expect(alwaysScopeRadio()).toHaveAttribute('aria-checked', 'true');
  });
});

describe('keyboard only, start to finish — S-210', () => {
  it('completes the whole wizard with no click, only Tab and the keyboard', async () => {
    const { onCreated } = mount();
    const user = userEvent.setup();

    async function tabUntil(target: () => HTMLElement): Promise<void> {
      for (let i = 0; i < 60; i += 1) {
        if (document.activeElement === target()) return;
        await user.tab();
      }
      throw new Error('tabbed 60 times without reaching the target element');
    }

    // Step 1 — kind: search (no subject field at all, so step 2 completes with nothing typed).
    await tabUntil(() => screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.keyboard('{Enter}');
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.keyboard('{Enter}');

    // Step 2 — pattern: nothing to fill in for `search`, straight to Next.
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.keyboard('{Enter}');

    // Step 3 — decision: allow.
    await tabUntil(() => allowRadio());
    await user.keyboard('{Enter}');
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.keyboard('{Enter}');

    // Step 4 — folder: always, never leaving the keyboard for the picker.
    await tabUntil(() => alwaysScopeRadio());
    await user.keyboard('{Enter}');
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.keyboard('{Enter}');

    // Step 5 — validity: the first shortcut.
    await tabUntil(() =>
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await user.keyboard('{Enter}');
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.keyboard('{Enter}');

    // Step 6 — review: Confirm, once the preview has settled.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('rules.wizard.confirm') })).toBeEnabled();
    });
    await tabUntil(() => screen.getByRole('button', { name: t('rules.wizard.confirm') }));
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule_new' }));
    });
  });
});

describe('the review step’s own command tester — S-198', () => {
  it('tests a command considering the rule being authored, not yet granted', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(allowRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(alwaysScopeRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await screen.findByText(t('rules.wizard.stepOf', { step: t('rules.wizard.stepReview') }));

    await user.click(screen.getByText(t('rules.test.heading')));
    await user.click(
      within(screen.getByRole('radiogroup', { name: t('rules.test.kindStepLabel') })).getByRole(
        'radio',
        { name: t('sessions.kind.shell') },
      ),
    );
    await user.type(
      screen.getByRole('textbox', { name: t('rules.wizard.subjectCommand') }),
      'git status',
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/permission-rules/evaluate',
        expect.objectContaining({ draft: { pattern: 'search', decision: 'allow' } }),
      );
    });
  });
});

describe('axe — one check per step — B-32, S-209', () => {
  it('kind', async () => {
    const { container } = mount();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('pattern, with a real subject field on screen', async () => {
    const { container } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.shell') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await screen.findByRole('textbox', { name: t('rules.wizard.subjectCommand') });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('decision', async () => {
    const { container } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    expect(await axe(container)).toHaveNoViolations();
  });

  it('folder', async () => {
    const { container } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(allowRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    expect(await axe(container)).toHaveNoViolations();
  });

  it('validity', async () => {
    const { container } = mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: t('sessions.kind.search') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(allowRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));
    await user.click(alwaysScopeRadio());
    await user.click(screen.getByRole('button', { name: t('rules.wizard.next') }));

    expect(await axe(container)).toHaveNoViolations();
  });

  it('review, once the preview answers, command tester included', async () => {
    const { container } = mount();
    const user = userEvent.setup();

    await advanceToReview(user);
    await screen.findByRole('button', { name: t('rules.wizard.confirm') });

    expect(await axe(container)).toHaveNoViolations();
  });
});
