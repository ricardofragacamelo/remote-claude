import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { useAuthStore } from '@/features/auth';
import { RulesNavBadge } from '@/features/permission/components/RulesNavBadge';
import * as service from '@/features/permission/services/rule.service';
import { render } from '../../../support/render';

const SESSION = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

beforeEach(() => {
  useAuthStore.setState({ status: 'unknown', session: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ status: 'unknown', session: null });
});

describe('the badge on the "Regras" entry of the global navigation — plan 15, B-25, S-178', () => {
  it('reads nothing, and shows nothing, while signed out — the rail renders before sign-in too', () => {
    const get = vi.spyOn(service, 'fetchRuleSummary');

    const { container } = render(<RulesNavBadge />);

    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalled();
  });

  it('shows how many active rules expire within seven days', async () => {
    useAuthStore.getState().signedIn(SESSION);
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({
      byStatus: { active: 10, expired: 0, revoked: 0, disabled: 0 },
      byDecision: { allow: 10, deny: 0 },
      byScope: { project: 0, always: 10 },
      expiringBefore: 4,
    });

    render(<RulesNavBadge />);

    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('shows nothing when none expire soon — zero hides the badge', async () => {
    useAuthStore.getState().signedIn(SESSION);
    vi.spyOn(service, 'fetchRuleSummary').mockResolvedValue({
      byStatus: { active: 10, expired: 0, revoked: 0, disabled: 0 },
      byDecision: { allow: 10, deny: 0 },
      byScope: { project: 0, always: 10 },
      expiringBefore: 0,
    });

    const { container } = render(<RulesNavBadge />);

    await waitFor(() => {
      expect(service.fetchRuleSummary).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing while still loading, and nothing on a failed read', async () => {
    useAuthStore.getState().signedIn(SESSION);
    const fetch = vi.spyOn(service, 'fetchRuleSummary').mockRejectedValue({
      code: 'INTERNAL',
      messageKey: 'error.internal',
      params: {},
    });

    const { container } = render(<RulesNavBadge />);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
