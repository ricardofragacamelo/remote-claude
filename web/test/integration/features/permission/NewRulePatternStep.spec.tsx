import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRulePatternStep } from '@/features/permission/components/NewRulePatternStep';
import type { NewRulePatternStepProps } from '@/features/permission/components/NewRulePatternStep';
import type { NewRuleForm } from '@/features/permission/lib/new-rule-pattern';
import type { NewRuleKind } from '@/features/permission/lib/rule-kind-fields';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const PREVIEW = {
  pattern: 'shell(git status)',
  reach: { kind: 'shell', form: 'exact', content: 'git status', excludesCompound: false },
  breadth: 'narrow',
  findings: [],
};

interface HarnessState {
  readonly kind: NewRuleKind;
  readonly form: NewRuleForm;
  readonly subject: string;
  readonly mcpTool: string;
}

function Harness({ initial }: { readonly initial: HarnessState }): React.JSX.Element {
  const [state, setState] = useState(initial);

  return (
    <NewRulePatternStep
      kind={state.kind}
      form={state.form}
      subject={state.subject}
      mcpTool={state.mcpTool}
      onChange={(patch: Partial<Pick<NewRulePatternStepProps, 'form' | 'subject' | 'mcpTool'>>) => {
        setState((current) => ({ ...current, ...patch }));
      }}
    />
  );
}

function mount(initial: HarnessState) {
  const post = vi.spyOn(api, 'post').mockResolvedValue(PREVIEW);
  const mounted = render(<Harness initial={initial} />);
  return { ...mounted, post };
}

describe('the subject field, by kind — S-186', () => {
  it('asks for a command, with the prefix form offered, for shell', async () => {
    mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });

    expect(
      screen.getByRole('radiogroup', { name: t('rules.wizard.patternFormLabel') }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(t('rules.wizard.subjectCommand'))).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t('rules.wizard.formPrefix') })).toBeInTheDocument();
  });

  it('asks for a path, with no prefix form, for a file kind — D-08', async () => {
    mount({ kind: 'file.edit', form: 'exact', subject: '', mcpTool: '' });

    expect(screen.getByLabelText(t('rules.wizard.subjectPath'))).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: t('rules.wizard.formPrefix') }),
    ).not.toBeInTheDocument();
  });

  it('asks for a domain, for web.fetch', async () => {
    mount({ kind: 'web.fetch', form: 'exact', subject: '', mcpTool: '' });

    expect(screen.getByLabelText(t('rules.wizard.subjectDomain'))).toBeInTheDocument();
  });

  it('offers no subject field at all for a whole-kind-only kind, and says so', async () => {
    mount({ kind: 'search', form: 'exact', subject: '', mcpTool: '' });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(
      screen.getByText(t('rules.wizard.patternWholeKindOnly', { kind: t('sessions.kind.search') })),
    ).toBeInTheDocument();
  });

  it('offers only the server and the tool for mcp, never a bare whole-kind option', async () => {
    mount({ kind: 'mcp', form: 'exact', subject: '', mcpTool: '' });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByLabelText(t('rules.wizard.mcpServer'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('rules.wizard.mcpTool'))).toBeInTheDocument();
  });

  it('switches between any, exact and prefix, each one choosable by itself', async () => {
    const user = userEvent.setup();
    mount({ kind: 'shell', form: 'exact', subject: 'git status', mcpTool: '' });

    await user.click(
      screen.getByRole('radio', {
        name: t('rules.wizard.formAny', { kind: t('sessions.kind.shell') }),
      }),
    );
    expect(screen.queryByLabelText(t('rules.wizard.subjectCommand'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: t('rules.wizard.formPrefix') }));
    expect(screen.getByRole('radio', { name: t('rules.wizard.formPrefix') })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(screen.getByRole('radio', { name: t('rules.wizard.formExact') }));
    expect(screen.getByRole('radio', { name: t('rules.wizard.formExact') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('hides the subject input once "any" is picked', async () => {
    const user = userEvent.setup();
    mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });
    expect(screen.getByLabelText(t('rules.wizard.subjectCommand'))).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', {
        name: t('rules.wizard.formAny', { kind: t('sessions.kind.shell') }),
      }),
    );

    expect(screen.queryByLabelText(t('rules.wizard.subjectCommand'))).not.toBeInTheDocument();
  });
});

describe('the pattern preview, built from the three fields — S-185', () => {
  it('shows the whole kind until a subject is typed', () => {
    mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });

    expect(screen.getByLabelText(t('rules.wizard.patternPreviewLabel'))).toHaveTextContent('shell');
  });

  it('shows the exact pattern once a subject is typed', async () => {
    const user = userEvent.setup();
    mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });

    await user.type(screen.getByLabelText(t('rules.wizard.subjectCommand')), 'git status');

    expect(screen.getByLabelText(t('rules.wizard.patternPreviewLabel'))).toHaveTextContent(
      'shell(git status)',
    );
  });

  it('writes the prefix form with :* — shell only', () => {
    mount({ kind: 'shell', form: 'prefix', subject: 'git', mcpTool: '' });

    expect(screen.getByLabelText(t('rules.wizard.patternPreviewLabel'))).toHaveTextContent(
      'shell(git:*)',
    );
  });

  it('writes mcp(server:*) with no tool typed, never the bare server name', async () => {
    const user = userEvent.setup();
    mount({ kind: 'mcp', form: 'exact', subject: '', mcpTool: '' });

    await user.type(screen.getByLabelText(t('rules.wizard.mcpServer')), 'myserver');

    expect(screen.getByLabelText(t('rules.wizard.patternPreviewLabel'))).toHaveTextContent(
      'mcp(myserver:*)',
    );
  });

  it('writes mcp(server:tool) once the tool is also typed', async () => {
    const user = userEvent.setup();
    mount({ kind: 'mcp', form: 'exact', subject: '', mcpTool: '' });

    await user.type(screen.getByLabelText(t('rules.wizard.mcpServer')), 'myserver');
    await user.type(screen.getByLabelText(t('rules.wizard.mcpTool')), 'mytool');

    expect(screen.getByLabelText(t('rules.wizard.patternPreviewLabel'))).toHaveTextContent(
      'mcp(myserver:mytool)',
    );
  });
});

describe('the live preview — debounced, and not asked about an empty draft', () => {
  it('never asks the server while a subject-shaped form has nothing typed yet', async () => {
    const { post } = mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks the server once a whole-kind draft is ready, with no debounce on the first value', async () => {
    const { post } = mount({ kind: 'search', form: 'exact', subject: '', mcpTool: '' });

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/permission-rules/preview',
        expect.objectContaining({ pattern: 'search', decision: 'allow', scope: 'always' }),
      );
    });
  });

  it('debounces a change to the subject — settling once, not once per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    const { post } = mount({ kind: 'shell', form: 'exact', subject: '', mcpTool: '' });

    // "git status" is 10 keystrokes; each resets the debounce's own timer (`useDebouncedValue`),
    // so none of them but the first (the ready/not-ready edge, still against the stale debounced
    // value) reaches the server while typing is still going.
    await user.type(screen.getByLabelText(t('rules.wizard.subjectCommand')), 'git status');

    expect(post.mock.calls.length).toBeLessThan(10);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith(
        '/permission-rules/preview',
        expect.objectContaining({ pattern: 'shell(git status)' }),
      );
    });

    vi.useRealTimers();
  });

  it('shows the live sentence once the preview answers — S-185', async () => {
    mount({ kind: 'search', form: 'exact', subject: '', mcpTool: '' });

    expect(
      await screen.findByText(t('permission.ruleSentence.actionExact', { content: 'git status' }), {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it('shows the server’s own translated grammar error before anything is sent — S-185', async () => {
    const error = {
      messageKey: 'permission.error.patternInvalid',
      params: { pattern: 'shell(bad' },
    };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    render(<Harness initial={{ kind: 'search', form: 'exact', subject: '', mcpTool: '' }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('permission.error.patternInvalid', { pattern: 'shell(bad' }),
    );
  });
});
