import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { CommandTestPanel } from '@/features/permission/components/CommandTestPanel';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const NO_RULE_EVALUATION = {
  outcome: 'ask',
  answeringRule: null,
  matching: [],
  reasons: ['noRule'],
  caveats: [],
};

function mount(onOpenRule = vi.fn()) {
  const post = vi.fn();
  vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
    if (String(path) !== '/permission-rules/evaluate') {
      return Promise.reject(new Error(`unexpected POST ${String(path)}`));
    }
    post(body);
    return Promise.resolve(NO_RULE_EVALUATION);
  });
  render(<CommandTestPanel onOpenRule={onOpenRule} />);
  return { post, onOpenRule };
}

function kindRadio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

describe('CommandTestPanel — "testar um comando" (plan 15, B-28)', () => {
  it('shows nothing of the server yet, and asks nothing, with no kind chosen', () => {
    const { post } = mount();

    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks the server as soon as a kind needing no subject is picked, and reads the verdict — S-196', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      outcome: 'allow',
      answeringRule: { id: 'rule_1', pattern: 'search', decision: 'allow', scope: 'always' },
      matching: [{ id: 'rule_1', pattern: 'search', decision: 'allow', scope: 'always' }],
      reasons: ['ruleAnswers'],
      caveats: [{ messageKey: 'rules.test.verdictAskNoRule', params: {} }],
    });
    render(<CommandTestPanel onOpenRule={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/permission-rules/evaluate',
        expect.objectContaining({ kind: 'search', subject: {} }),
      );
    });
    expect(
      await screen.findByText(t('rules.test.verdictAllowedByRule', { pattern: 'search' })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('rules.test.matching'))).toBeInTheDocument();
    expect(screen.getByText(t('rules.test.caveats'))).toBeInTheDocument();
  });

  it('shows a plain explanation, with no input, for a kind the grammar never narrows by subject', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.agent')));

    expect(
      screen.getByText(t('rules.test.subjectOptionalBody', { kind: 'agent' })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows one text field for a command kind', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.shell')));

    expect(screen.getByLabelText(t('rules.wizard.subjectCommand'))).toBeInTheDocument();
  });

  it('shows one text field for a path kind', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.fileRead')));

    expect(screen.getByLabelText(t('rules.wizard.subjectPath'))).toBeInTheDocument();
  });

  it('shows one text field for a domain kind', async () => {
    mount();
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.webFetch')));

    expect(screen.getByLabelText(t('rules.wizard.subjectDomain'))).toBeInTheDocument();
  });

  it('shows the server and the tool fields for `mcp`, and debounces typing into either', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    const { post } = mount();

    await user.click(kindRadio(t('sessions.kind.mcp')));
    await user.type(screen.getByLabelText(t('rules.wizard.mcpServer')), 'git');

    expect(post).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ subject: { server: 'git' } }));
    });

    await user.type(screen.getByLabelText(t('rules.wizard.mcpTool')), 'status');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith(
        expect.objectContaining({ subject: { server: 'git', tool: 'status' } }),
      );
    });

    vi.useRealTimers();
  });

  it('switching the mode re-asks the server with the new mode, and the verdict follows — S-197', async () => {
    const post = vi.fn();
    vi.spyOn(api, 'post').mockImplementation((_path: unknown, body?: unknown) => {
      const input = body as { mode?: string };
      post(input);
      return Promise.resolve(
        input.mode === 'readOnly'
          ? {
              outcome: 'ask',
              answeringRule: null,
              matching: [],
              reasons: ['readOnlyMode'],
              caveats: [],
            }
          : NO_RULE_EVALUATION,
      );
    });
    render(<CommandTestPanel onOpenRule={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ask' }));
    });
    expect(await screen.findByText(t('rules.test.verdictAskNoRule'))).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: t('sessions.mode.readOnly') }));

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'readOnly' }));
    });
    expect(await screen.findByText(t('rules.test.verdictAskReadOnly'))).toBeInTheDocument();
  });

  it('a folder the server refuses shows the translated failure — S-199', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    vi.spyOn(api, 'post').mockRejectedValue({
      code: 'WORKSPACE_NOT_ALLOWED',
      messageKey: 'errors.workspaceNotAllowed',
      params: { folder: projects.path },
    });
    render(<CommandTestPanel onOpenRule={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));
    await user.click(screen.getByRole('button', { name: t('rules.test.folderChoose') }));
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }));

    expect(
      await screen.findByText(t('errors.workspaceNotAllowed', { folder: projects.path })),
    ).toBeInTheDocument();
  });

  it('clears a chosen folder', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    mount();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: t('rules.test.folderChoose') }));
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }));

    await user.click(screen.getByRole('button', { name: t('rules.test.folderClear') }));

    expect(screen.queryByText(projects.path)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('rules.test.folderChoose') })).toBeInTheDocument();
  });

  it('calls onOpenRule with the matching rule’s id when its "open" button is clicked', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      outcome: 'deny',
      answeringRule: {
        id: 'rule_deny',
        pattern: 'shell(rm -rf /)',
        decision: 'deny',
        scope: 'always',
      },
      matching: [
        { id: 'rule_deny', pattern: 'shell(rm -rf /)', decision: 'deny', scope: 'always' },
      ],
      reasons: ['ruleAnswers'],
      caveats: [],
    });
    const onOpenRule = vi.fn();
    render(<CommandTestPanel onOpenRule={onOpenRule} />);
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));
    await user.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );

    expect(onOpenRule).toHaveBeenCalledWith('rule_deny');
  });

  it('forwards the wizard’s own draft rule as `draft` on every evaluate call — S-198', async () => {
    const post = vi.fn();
    vi.spyOn(api, 'post').mockImplementation((_path: unknown, body?: unknown) => {
      post(body);
      return Promise.resolve(NO_RULE_EVALUATION);
    });
    render(
      <CommandTestPanel
        draft={{ pattern: 'shell(git status)', decision: 'allow' }}
        onOpenRule={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: { pattern: 'shell(git status)', decision: 'allow' },
        }),
      );
    });
  });

  it('has no axe violations, with a verdict, matching rules and caveats shown — B-32, S-209', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      outcome: 'allow',
      answeringRule: { id: 'rule_1', pattern: 'search', decision: 'allow', scope: 'always' },
      matching: [{ id: 'rule_1', pattern: 'search', decision: 'allow', scope: 'always' }],
      reasons: ['ruleAnswers'],
      caveats: [{ messageKey: 'rules.test.verdictAskNoRule', params: {} }],
    });
    const { container } = render(<CommandTestPanel onOpenRule={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(kindRadio(t('sessions.kind.search')));
    await screen.findByText(t('rules.test.verdictAllowedByRule', { pattern: 'search' }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
