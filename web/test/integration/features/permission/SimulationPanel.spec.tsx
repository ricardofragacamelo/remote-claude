import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditTrailEntry } from '@remote-claude/contracts';

import { SimulationPanel } from '@/features/permission/components/SimulationPanel';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function anInvocation(overrides: Partial<AuditTrailEntry> = {}): AuditTrailEntry {
  return {
    id: 'entry-1',
    sessionId: 'session-1',
    toolUseId: 'tool-1',
    toolName: 'Bash',
    kind: 'shell',
    input: {},
    decision: 'allowed',
    at: '2026-09-24T10:00:00.000Z',
    traceId: null,
    verdict: null,
    ...overrides,
  };
}

const EMPTY_TRAIL = {
  counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
  changes: [],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

const NO_CHANGES = {
  counts: { unchanged: 5, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
  changes: [],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

const WITH_CHANGES = {
  counts: { unchanged: 3, wouldAutoAllow: 2, wouldAutoDeny: 0, wouldAsk: 1 },
  changes: [
    {
      before: 'ask' as const,
      after: 'allow' as const,
      entry: anInvocation({ id: 'entry-1' }),
      answeringRule: {
        id: 'rule_1',
        pattern: 'shell(git status)',
        decision: 'allow',
        scope: 'always',
      },
    },
    {
      before: 'ask' as const,
      after: 'deny' as const,
      entry: anInvocation({ id: 'entry-2' }),
      answeringRule: null,
    },
  ],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

function mockSimulate(response: unknown): ReturnType<typeof vi.fn> {
  const post = vi.fn();
  vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
    if (String(path) !== '/permission-rules/simulate') {
      return Promise.reject(new Error(`unexpected POST ${String(path)}`));
    }
    post(body);
    return Promise.resolve(response);
  });
  return post;
}

describe('SimulationPanel — "se esta regra existisse" / "se eu revogar esta" (plan 15, B-29)', () => {
  it('asks the server with the default limit, and shows counts and changes — S-200', async () => {
    const post = mockSimulate(WITH_CHANGES);
    render(
      <SimulationPanel
        add={[{ pattern: 'shell(git status)', decision: 'allow' }]}
        onOpenRule={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith({
        add: [{ pattern: 'shell(git status)', decision: 'allow' }],
        limit: 200,
      });
    });

    expect(
      await screen.findByText(
        t('rules.simulate.countsSummary', {
          limit: 200,
          wouldAutoAllow: 2,
          wouldAutoDeny: 0,
          wouldAsk: 1,
          unchanged: 3,
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(t('rules.simulate.changesHeading'))).toBeInTheDocument();
    expect(screen.getByText(t('rules.simulate.assumedMode'))).toBeInTheDocument();
  });

  it('forwards `remove` as-is, instead of `add`, when given that', async () => {
    const post = mockSimulate(NO_CHANGES);
    render(<SimulationPanel remove={['rule_1', 'rule_2']} onOpenRule={vi.fn()} />);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith({ remove: ['rule_1', 'rule_2'], limit: 200 });
    });
  });

  it('shows the empty-trail text instead of counts, when nothing at all was read', async () => {
    mockSimulate(EMPTY_TRAIL);
    render(<SimulationPanel add={[]} onOpenRule={vi.fn()} />);

    expect(await screen.findByText(t('rules.simulate.emptyTrail'))).toBeInTheDocument();
    expect(screen.queryByText(t('rules.simulate.changesHeading'))).not.toBeInTheDocument();
  });

  it('shows "nothing would change" when the trail has entries but none would change', async () => {
    mockSimulate(NO_CHANGES);
    render(<SimulationPanel add={[]} onOpenRule={vi.fn()} />);

    expect(await screen.findByText(t('rules.simulate.noChanges'))).toBeInTheDocument();
    expect(screen.queryByText(t('rules.simulate.emptyTrail'))).not.toBeInTheDocument();
    expect(screen.queryByText(t('rules.simulate.changesHeading'))).not.toBeInTheDocument();
  });

  it('shows the withoutFolder warning only when it is greater than zero', async () => {
    mockSimulate({ ...NO_CHANGES, withoutFolder: 4 });
    render(<SimulationPanel add={[]} onOpenRule={vi.fn()} />);

    expect(
      await screen.findByText(t('rules.simulate.withoutFolder', { count: 4 })),
    ).toBeInTheDocument();
  });

  it('shows no withoutFolder warning when it is zero', async () => {
    mockSimulate(NO_CHANGES);
    render(<SimulationPanel add={[]} onOpenRule={vi.fn()} />);

    await screen.findByText(t('rules.simulate.noChanges'));
    expect(
      screen.queryByText(t('rules.simulate.withoutFolder', { count: 0 })),
    ).not.toBeInTheDocument();
  });

  it('re-asks the server with the chosen limit, and the new response replaces the old one', async () => {
    const post = vi.fn();
    vi.spyOn(api, 'post').mockImplementation((_path: unknown, body?: unknown) => {
      const input = body as { limit?: number };
      post(input);
      return Promise.resolve(input.limit === 1000 ? NO_CHANGES : WITH_CHANGES);
    });
    render(<SimulationPanel add={[]} onOpenRule={vi.fn()} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    });
    expect(await screen.findByText(t('rules.simulate.changesHeading'))).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '1000' }));

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1000 }));
    });
    expect(await screen.findByText(t('rules.simulate.noChanges'))).toBeInTheDocument();
    expect(screen.queryByText(t('rules.simulate.changesHeading'))).not.toBeInTheDocument();
  });

  it('carries `folder` along, when given', async () => {
    const post = mockSimulate(NO_CHANGES);
    render(<SimulationPanel add={[]} folder="/srv/app" onOpenRule={vi.fn()} />);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ folder: '/srv/app' }));
    });
  });

  it('shows the translated failure when the server refuses the request', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({
      code: 'WORKSPACE_NOT_ALLOWED',
      messageKey: 'errors.workspaceNotAllowed',
      params: { folder: '/srv/app' },
    });
    render(<SimulationPanel add={[]} folder="/srv/app" onOpenRule={vi.fn()} />);

    expect(
      await screen.findByText(t('errors.workspaceNotAllowed', { folder: '/srv/app' })),
    ).toBeInTheDocument();
  });

  it('calls onOpenRule with the answering rule’s id, only when a change has one', async () => {
    mockSimulate(WITH_CHANGES);
    const onOpenRule = vi.fn();
    render(<SimulationPanel add={[]} onOpenRule={onOpenRule} />);
    const user = userEvent.setup();

    const openButtons = await screen.findAllByRole('button', {
      name: t('permission.ruleDetail.openInvolvedRule'),
    });
    expect(openButtons).toHaveLength(1);

    await user.click(openButtons[0] as HTMLElement);

    expect(onOpenRule).toHaveBeenCalledWith('rule_1');
  });
});
