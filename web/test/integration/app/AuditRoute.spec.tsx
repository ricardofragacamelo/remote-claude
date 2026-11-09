import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { navigation } from '@/shared/lib/navigation';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const ruledEntry = {
  id: 'e1',
  sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  toolUseId: 'tu-1',
  toolName: 'Write',
  input: { file_path: '/workspace/summary.md' },
  decision: 'allowed',
  at: '2026-09-24T12:00:00.000Z',
  traceId: 'trace-1',
  verdict: {
    requestId: 'req-1',
    auto: true,
    ruleId: 'rule_1',
    scope: 'always',
    resolvedBy: 'auth|42',
    resolvedFrom: null,
  },
};

const revokedRule = {
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
  status: 'revoked',
  revokedAt: '2026-09-24T13:00:00.000Z',
  etag: '"etag-1"',
  expiryCeiling: '2027-09-20T10:00:00.000Z',
};

/** `/audit` and `/rules/:ruleId`, reached by their links alone — which is what routes are for. */
function mountAt(url: string) {
  const mounted = mountApp(url);

  return { ...mounted, location: () => mounted.router.state.location };
}

describe('the audit route', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks an anonymous visitor to sign in, and reads nothing first', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
    const get = vi.spyOn(api, 'get');

    mountAt('/audit');

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('comes back to the filtered trail after signing in, not to the whole of it — S-43', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
    const login = vi
      .spyOn(authService, 'beginLogin')
      .mockResolvedValue('https://provider.test/authorize');
    vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);

    mountAt('/audit?sessionId=S1&decision=allowed');
    await userEvent.click(await screen.findByRole('button', { name: t('auth.signIn.action') }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('/audit?sessionId=S1&decision=allowed');
    });
  });

  it('reads the trail with the filters the link carries — the URL is the state', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    mountAt('/audit?toolName=Bash&decision=denied');

    expect(await screen.findByText(t('audit.list.emptyTitle'))).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/audit-entries?toolName=Bash&decision=denied');
    expect(screen.getByRole('heading', { name: t('audit.screen.title') })).toBeInTheDocument();
  });

  it('puts applied filters in the URL, and reads the trail again with them', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const get = vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    const user = userEvent.setup();
    const mounted = mountAt('/audit');
    await screen.findByText(t('audit.list.emptyTitle'));

    await user.type(screen.getByLabelText(t('audit.filter.tool')), 'Read');
    await user.click(screen.getByRole('button', { name: t('audit.filter.apply') }));

    await waitFor(() => {
      expect(mounted.location().search).toEqual({ toolName: 'Read' });
    });
    await waitFor(() => {
      expect(get).toHaveBeenLastCalledWith('/audit-entries?toolName=Read');
    });
  });

  it('opens the rule behind an entry, and shows it revoked with the state explained — S-50', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const get = vi.spyOn(api, 'get').mockImplementation((path: string) => {
      if (path.startsWith('/audit-entries')) {
        return Promise.resolve({ entries: [ruledEntry], nextCursor: null });
      }
      if (path.includes('/permission-rules/summary')) {
        return Promise.resolve({
          byStatus: { active: 0, expired: 0, revoked: 1, disabled: 0 },
          byDecision: { allow: 0, deny: 0 },
          byScope: { project: 0, always: 0 },
          expiringBefore: 0,
        });
      }
      if (path.includes('/invocations')) {
        return Promise.resolve({ invocations: [], nextCursor: null });
      }
      if (path.includes('/history')) {
        return Promise.resolve({ events: [] });
      }
      if (path.endsWith('/permission-rules/rule_1')) {
        return Promise.resolve(revokedRule);
      }
      return Promise.resolve({ rules: [], nextCursor: null });
    });
    const user = userEvent.setup();
    const mounted = mountAt('/audit');

    await user.click(await screen.findByRole('button', { name: t('audit.row.openRule') }));

    await waitFor(() => {
      expect(mounted.location().pathname).toBe('/rules/rule_1');
    });
    expect(
      await screen.findByText(
        t('rules.row.revokedOn', {
          at: new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
            new Date(revokedRule.revokedAt),
          ),
        }),
      ),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/permission-rules/rule_1');
    expect(screen.getByRole('heading', { name: t('rules.screen.title') })).toBeInTheDocument();
  });

  it('lives in its own screen of the frame, with the trail of today and its help — S-136', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });

    mountAt('/audit?toolName=Bash');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('audit.screen.title') }),
    ).toBeVisible();
    expect(screen.getByText(t('audit.screen.purpose'))).toBeVisible();
    expect(screen.getByRole('button', { name: t('help.panel.open') })).toBeVisible();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('toolName=Bash'));
  });

  it('leads to the rules from the navigation, lit on the trail — S-90', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [], nextCursor: null });
    const user = userEvent.setup();
    const mounted = mountAt('/audit?decision=allowed');

    expect(await screen.findByRole('link', { name: t('navigation.entry.audit') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(screen.getByRole('link', { name: t('navigation.entry.rules') }));

    await waitFor(() => {
      expect(mounted.location().pathname).toBe('/rules');
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ entries: [ruledEntry], nextCursor: null });
    const { container } = mountAt('/audit');
    await screen.findByRole('button', { name: t('audit.row.openRule') });

    expect(await axe(container)).toHaveNoViolations();
  });
});
