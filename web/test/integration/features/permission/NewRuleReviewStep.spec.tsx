import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRuleReviewStep } from '@/features/permission/components/NewRuleReviewStep';
import type { NewRuleReviewStepProps } from '@/features/permission/components/NewRuleReviewStep';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import type { RulePreview } from '@/features/permission/types/rule';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const NARROW_PREVIEW: RulePreview = {
  pattern: 'shell(git status)',
  reach: { kind: 'shell', form: 'exact', content: 'git status', excludesCompound: false },
  breadth: 'narrow',
  findings: [],
};

const BROAD_PREVIEW: RulePreview = {
  pattern: 'file.read',
  reach: { kind: 'file.read', form: 'any', content: null, excludesCompound: false },
  breadth: 'broad',
  findings: [],
};

const UNBOUNDED_PREVIEW: RulePreview = {
  pattern: 'shell',
  reach: { kind: 'shell', form: 'any', content: null, excludesCompound: false },
  breadth: 'unbounded',
  findings: [],
};

const IDENTICAL_PREVIEW = {
  ...NARROW_PREVIEW,
  findings: [
    {
      kind: 'identical' as const,
      ruleIds: ['rule_existing'],
      messageKey: 'permission.ruleDetail.findingIdentical',
      params: {},
    },
  ],
};

const SIMULATION = {
  counts: { unchanged: 3, wouldAutoAllow: 2, wouldAutoDeny: 0, wouldAsk: 1 },
  changes: [],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

const CREATED_RULE = {
  id: 'rule_new',
  scope: 'always',
  kind: 'shell',
  toolName: 'shell',
  pattern: 'shell(git status)',
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

function baseProps(overrides: Partial<NewRuleReviewStepProps> = {}): NewRuleReviewStepProps {
  return {
    pattern: 'shell(git status)',
    decision: 'allow',
    scope: 'always',
    folder: null,
    expiresAt: '2026-12-19T10:00:00.000Z',
    preview: NARROW_PREVIEW,
    acknowledgeBroad: false,
    onAcknowledgeBroad: vi.fn(),
    onOpenRule: vi.fn(),
    onGranted: vi.fn(),
    onFolderRefused: vi.fn(),
    ...overrides,
  };
}

function mockSimulation(): void {
  vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
    const p = String(path);
    if (p.includes('/simulate')) {
      return Promise.resolve(SIMULATION);
    }
    if (p === '/permission-rules') {
      return Promise.resolve({ ...CREATED_RULE, ...(body as object) });
    }
    return Promise.reject(new Error(`unexpected POST ${p}`));
  });
}

describe('the second step, for allow and deny alike — S-188', () => {
  it('shows the reach sentence, the decision and the pattern, for allow', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps()} />);

    expect(screen.getByText('shell(git status)')).toBeInTheDocument();
    expect(screen.getByText(t('rules.decision.allow'))).toBeInTheDocument();
    expect(
      await screen.findByText(t('permission.ruleSentence.actionExact', { content: 'git status' }), {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it('shows the reach sentence and the decision for deny too', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps({ decision: 'deny' })} />);

    expect(screen.getByText(t('rules.decision.deny'))).toBeInTheDocument();
  });

  it('shows the simulation summary once it answers, inside its own disclosure — D-15', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText(t('rules.simulate.heading')));

    expect(
      await screen.findByText(
        t('rules.simulate.countsSummary', {
          limit: 200,
          wouldAutoAllow: 2,
          wouldAutoDeny: 0,
          wouldAsk: 1,
          unchanged: 3,
        }),
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it('sends nothing merely by being on screen — no POST before Confirm', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      if (String(path).includes('/simulate')) return Promise.resolve(SIMULATION);
      return Promise.reject(new Error('should not be called'));
    });
    render(<NewRuleReviewStep {...baseProps()} />);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/simulate', expect.anything());
    });
    expect(post).not.toHaveBeenCalledWith('/permission-rules', expect.anything());
  });
});

describe('the width gate — S-189, D-09', () => {
  it('lets a narrow draft confirm with no acknowledgement needed', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps({ preview: NARROW_PREVIEW })} />);

    expect(await screen.findByRole('button', { name: t('rules.wizard.confirm') })).toBeEnabled();
  });

  it('keeps Confirm disabled for a broad allow until acknowledged, then enables it', async () => {
    mockSimulation();
    const onAcknowledgeBroad = vi.fn();
    const { rerender } = render(
      <NewRuleReviewStep
        {...baseProps({ preview: BROAD_PREVIEW, onAcknowledgeBroad, acknowledgeBroad: false })}
      />,
    );

    const confirm = await screen.findByRole('button', { name: t('rules.wizard.confirm') });
    expect(confirm).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox'));
    expect(onAcknowledgeBroad).toHaveBeenCalledWith(true);

    rerender(
      <NewRuleReviewStep
        {...baseProps({ preview: BROAD_PREVIEW, onAcknowledgeBroad, acknowledgeBroad: true })}
      />,
    );
    expect(screen.getByRole('button', { name: t('rules.wizard.confirm') })).toBeEnabled();
  });

  it('blocks an unbounded allow outright, with no way to acknowledge past it', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps({ pattern: 'shell', preview: UNBOUNDED_PREVIEW })} />);

    expect(await screen.findByRole('button', { name: t('rules.wizard.confirm') })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.getByText(t('rules.wizard.unboundedBlocked', { pattern: 'shell' }), { exact: false }),
    ).toBeInTheDocument();
  });

  it('accepts an unbounded deny — D-09 only refuses it for allow', async () => {
    mockSimulation();
    render(<NewRuleReviewStep {...baseProps({ decision: 'deny', preview: UNBOUNDED_PREVIEW })} />);

    expect(await screen.findByRole('button', { name: t('rules.wizard.confirm') })).toBeEnabled();
  });
});

describe('an identical draft — S-190', () => {
  it('blocks Confirm and offers to open the rule it duplicates, never a separate "extend"', async () => {
    mockSimulation();
    const onOpenRule = vi.fn();
    const user = userEvent.setup();
    render(<NewRuleReviewStep {...baseProps({ preview: IDENTICAL_PREVIEW, onOpenRule })} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(t('rules.wizard.identicalBlocked'));
    expect(screen.getByRole('button', { name: t('rules.wizard.confirm') })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );
    expect(onOpenRule).toHaveBeenCalledWith('rule_existing');
  });
});

describe('confirming — S-194, S-195', () => {
  it('creates the rule on Confirm, and only then', async () => {
    mockSimulation();
    const onGranted = vi.fn();
    const user = userEvent.setup();
    render(<NewRuleReviewStep {...baseProps({ onGranted })} />);

    await user.click(await screen.findByRole('button', { name: t('rules.wizard.confirm') }));

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule_new' }));
    });
  });

  it('a double click sends exactly one grant — S-194', async () => {
    // The grant's own request is held open deliberately: a mock that settled instantly would
    // close the dedup window before the second click ever lands, proving nothing (the two clicks
    // of a real double click are milliseconds apart, well inside an in-flight request).
    const grantCalls: unknown[] = [];
    let resolveGrant: (rule: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
      const p = String(path);
      if (p.includes('/simulate')) return Promise.resolve(SIMULATION);
      if (p === '/permission-rules') {
        grantCalls.push(body);
        return new Promise((resolve) => {
          resolveGrant = resolve;
        });
      }
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    const user = userEvent.setup();
    render(<NewRuleReviewStep {...baseProps()} />);

    const confirm = await screen.findByRole('button', { name: t('rules.wizard.confirm') });
    await user.dblClick(confirm);

    expect(grantCalls).toHaveLength(1);
    resolveGrant(CREATED_RULE);
  });

  it('a folder refused since the folder step hands the wizard back there — S-195', async () => {
    vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('/simulate')) return Promise.resolve(SIMULATION);
      if (p === '/permission-rules') {
        return Promise.reject({
          code: 'WORKSPACE_NOT_ALLOWED',
          messageKey: 'workspace.error.notAllowed',
          params: {},
        });
      }
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    const onFolderRefused = vi.fn();
    const user = userEvent.setup();
    render(
      <NewRuleReviewStep
        {...baseProps({ scope: 'project', folder: '/srv/app', onFolderRefused })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: t('rules.wizard.confirm') }));

    await waitFor(() => {
      expect(onFolderRefused).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(t('workspace.error.notAllowed'))).toBeInTheDocument();
  });
});
