import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AuditTrail } from '@/features/audit';
import type { AuditFilters } from '@/features/audit';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');
const AT = '2026-09-24T12:00:00.000Z';

function anEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
    toolUseId: 'tu-1',
    toolName: 'Bash',
    input: { command: 'git status' },
    decision: 'recorded',
    at: AT,
    traceId: 'trace-1',
    verdict: null,
    ...overrides,
  };
}

const verdict = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'req-1',
  auto: true,
  ruleId: 'rule-1',
  scope: 'always',
  resolvedBy: 'auth|42',
  resolvedFrom: null,
  ...overrides,
});

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-err',
};

/** The time as the row writes it. */
const shown = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));

function mount(filters: AuditFilters = {}) {
  const onFilter = vi.fn();
  const onOpenRule = vi.fn();
  const view = render(<AuditTrail filters={filters} onFilter={onFilter} onOpenRule={onOpenRule} />);
  return { ...view, onFilter, onOpenRule };
}

/**
 * The trail screen, through what a person sees and clicks.
 *
 * Every case is one line of docs/architecture/web/03-ui-system.md#trilha-de-auditoria or of the F2
 * matrix: the four states, each way a decision is explained in words, the rule that opens from
 * the entry it answered, and a "load more" that keeps what is on screen when it fails.
 */
describe('the audit trail screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while the trail is on its way — S-32', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    mount();

    expect(screen.getByLabelText(t('audit.list.loading'))).toBeInTheDocument();
  });

  it('shows the failure, translated, with a way to try again — S-32', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(unexpected)
      .mockResolvedValueOnce({ entries: [anEntry()], nextCursor: null });
    mount();

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText(t('audit.verdict.recorded'))).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state, saying what to do about it — S-32', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    mount({ toolName: 'Nothing' });

    expect(await screen.findByText(t('audit.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('audit.list.emptyDescription'))).toBeInTheDocument();
  });

  it('shows the entries, and the exact input in the detail — S-32', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry({ input: { command: 'rm -rf build/' } })],
      nextCursor: null,
    });
    mount();

    const row = await screen.findByRole('listitem', {
      name: t('audit.row.label', { tool: t('permission.tool.Bash'), at: shown(AT) }),
    });
    expect(within(row).getByText(t('audit.decision.recorded'))).toBeInTheDocument();
    expect(within(row).getByText(/rm -rf build\//)).toBeInTheDocument();
    expect(within(row).getByText('trace-1')).toBeInTheDocument();
  });

  it('names the rule that let it run, and opens it — S-30, S-50', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry({ decision: 'allowed', verdict: verdict() })],
      nextCursor: null,
    });
    const { onOpenRule } = mount();

    const row = await screen.findByRole('listitem', {
      name: t('audit.row.label', { tool: t('permission.tool.Bash'), at: shown(AT) }),
    });
    expect(within(row).getByText(t('audit.row.unasked'))).toBeInTheDocument();
    expect(
      within(row).getByText(
        t('audit.verdict.byRule', {
          decision: t('audit.decision.allowed'),
          scope: t('rules.scope.always'),
        }),
      ),
    ).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: t('audit.row.openRule') }));

    expect(onOpenRule).toHaveBeenCalledWith('rule-1');
  });

  it('says a session rule ended with its session, and offers nothing to open — S-75', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry({ decision: 'allowed', verdict: verdict({ scope: 'session' }) })],
      nextCursor: null,
    });
    mount();

    expect(
      await screen.findByText(
        t('audit.verdict.bySessionRule', { decision: t('audit.decision.allowed') }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('audit.row.openRule') })).toBeNull();
  });

  it('says who decided and from where, when a person did — S-79', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [
        anEntry({
          decision: 'denied',
          verdict: verdict({ auto: false, ruleId: null, scope: 'once', resolvedFrom: 'mobile' }),
        }),
      ],
      nextCursor: null,
    });
    mount();

    expect(
      await screen.findByText(
        t('audit.verdict.byPerson', {
          decision: t('audit.decision.denied'),
          who: 'auth|42',
          from: t('audit.origin.mobile'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('audit.row.unasked'))).toBeNull();
  });

  it('says nobody answered in time, when silence refused it — S-79', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [
        anEntry({
          decision: 'denied',
          verdict: verdict({ ruleId: null, scope: 'once', resolvedBy: null }),
        }),
      ],
      nextCursor: null,
    });
    mount();

    expect(await screen.findByText(t('audit.verdict.nobodyAnswered'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('audit.row.openRule') })).toBeNull();
  });

  it('says so of a decision written before the trail kept how, rather than guessing', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry({ decision: 'allowed', verdict: null, traceId: null })],
      nextCursor: null,
    });
    mount();

    expect(await screen.findByText(t('audit.verdict.unknown'))).toBeInTheDocument();
    expect(screen.getByText(t('audit.row.noTrace'))).toBeInTheDocument();
  });

  it('names a tool it has no words for by its own name', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry({ toolName: 'mcp__fs__stat' })],
      nextCursor: null,
    });
    mount();

    expect(
      await screen.findByText(t('permission.tool.unknown', { tool: 'mcp__fs__stat' })),
    ).toBeInTheDocument();
  });

  it('appends older entries, and keeps them all when the next page fails — S-77', async () => {
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ entries: [anEntry({ id: 'e3' })], nextCursor: '3' })
      .mockResolvedValueOnce({ entries: [anEntry({ id: 'e2' })], nextCursor: '2' })
      .mockRejectedValueOnce(unexpected);
    mount();

    const more = await screen.findByRole('button', { name: t('audit.list.loadMore') });
    await userEvent.click(more);
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    await userEvent.click(screen.getByRole('button', { name: t('audit.list.loadMore') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('common.error.unexpected'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: t('audit.list.loadMore') })).toBeEnabled();
  });

  it('offers no "load more" on the last page', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [anEntry()], nextCursor: null });
    mount();

    await screen.findByText(t('audit.verdict.recorded'));

    expect(screen.queryByRole('button', { name: t('audit.list.loadMore') })).toBeNull();
  });

  it('applies the filters as one step, not one per keystroke', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    const { onFilter } = mount();
    await screen.findByText(t('audit.list.emptyTitle'));

    await userEvent.type(screen.getByLabelText(t('audit.filter.session')), 'S1');
    await userEvent.type(screen.getByLabelText(t('audit.filter.tool')), 'Bash');
    await userEvent.selectOptions(
      screen.getByLabelText(t('audit.filter.decision')),
      t('audit.decision.allowed'),
    );
    expect(onFilter).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: t('audit.filter.apply') }));

    expect(onFilter).toHaveBeenCalledWith({
      sessionId: 'S1',
      toolName: 'Bash',
      decision: 'allowed',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('sends the period as instants', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    const { onFilter } = mount();
    await screen.findByText(t('audit.list.emptyTitle'));

    await userEvent.type(screen.getByLabelText(t('audit.filter.from')), '2026-09-01T10:00');
    await userEvent.type(screen.getByLabelText(t('audit.filter.to')), '2026-09-02T10:00');
    await userEvent.click(screen.getByRole('button', { name: t('audit.filter.apply') }));

    expect(onFilter).toHaveBeenCalledWith({
      from: new Date('2026-09-01T10:00').toISOString(),
      to: new Date('2026-09-02T10:00').toISOString(),
    });
  });

  it('clears every filter at once', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    const { onFilter } = mount({ toolName: 'Bash', decision: 'denied' });
    await screen.findByText(t('audit.list.emptyTitle'));

    await userEvent.click(screen.getByRole('button', { name: t('audit.filter.clear') }));

    expect(onFilter).toHaveBeenCalledWith({});
  });

  it('narrows the trail to the session of an entry', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [anEntry()], nextCursor: null });
    const { onFilter } = mount({ toolName: 'Bash' });

    const row = await screen.findByRole('listitem', {
      name: t('audit.row.label', { tool: t('permission.tool.Bash'), at: shown(AT) }),
    });
    await userEvent.click(within(row).getByText(t('audit.row.details')));
    await userEvent.click(
      within(row).getByRole('button', { name: t('audit.row.onlyThisSession') }),
    );

    expect(onFilter).toHaveBeenCalledWith({
      toolName: 'Bash',
      sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
    });
  });

  it('starts again from the top, with a fresh form, when the filters change — S-78', async () => {
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ entries: [anEntry({ id: 'old' })], nextCursor: '5' })
      .mockResolvedValueOnce({
        entries: [anEntry({ id: 'new', toolName: 'Write' })],
        nextCursor: null,
      });
    const onFilter = vi.fn();
    const onOpenRule = vi.fn();
    const view = render(<AuditTrail filters={{}} onFilter={onFilter} onOpenRule={onOpenRule} />);
    await screen.findByRole('button', { name: t('audit.list.loadMore') });

    view.rerender(
      <AuditTrail filters={{ toolName: 'Write' }} onFilter={onFilter} onOpenRule={onOpenRule} />,
    );

    expect(await screen.findByText(t('permission.tool.Write'))).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: t('audit.list.loadMore') })).toBeNull();
    expect(screen.getByLabelText(t('audit.filter.tool'))).toHaveValue('Write');
  });

  it('shows the filters it was opened with', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    mount({ sessionId: 'S9', decision: 'denied' });
    await screen.findByText(t('audit.list.emptyTitle'));

    expect(screen.getByLabelText(t('audit.filter.session'))).toHaveValue('S9');
    expect(screen.getByLabelText(t('audit.filter.decision'))).toHaveValue('denied');
  });

  it('has no accessibility violations with entries on screen', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      entries: [anEntry(), anEntry({ id: 'e2', decision: 'allowed', verdict: verdict() })],
      nextCursor: '1',
    });
    const { container } = mount();
    await screen.findByRole('button', { name: t('audit.list.loadMore') });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('reads in Portuguese too', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [anEntry()], nextCursor: null });
    const pt = translator('pt-BR');
    render(<AuditTrail filters={{}} onFilter={vi.fn()} onOpenRule={vi.fn()} />, 'pt-BR');

    expect(await screen.findByText(pt('audit.verdict.recorded'))).toBeInTheDocument();
  });
});
