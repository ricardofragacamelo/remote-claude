import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RulesRoute } from '@/app/RulesRoute';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { render, translator } from '../../support/render';

const t = translator('en');
const session = { accessToken: 'a', userId: 'auth|42', expiresAt: Date.now() + 900_000 };

/** `/rules`, reached by its link alone — which is what giving it a route is for. */
function mountRules() {
  const root = createRootRoute({ component: Outlet });
  const rules = createRoute({ getParentRoute: () => root, path: '/rules', component: RulesRoute });
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => null });

  const router = createRouter({
    routeTree: root.addChildren([rules, home]),
    history: createMemoryHistory({ initialEntries: ['/rules'] }),
  });

  return {
    ...render(<RouterProvider router={router} />),
    path: () => router.state.location.pathname,
  };
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
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    mountRules();

    expect(await screen.findByText(t('rules.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('rules.screen.title') })).toBeInTheDocument();
  });

  it('leads back to the sessions', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });
    const user = userEvent.setup();
    const mounted = mountRules();

    await user.click(await screen.findByRole('link', { name: t('rules.screen.back') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });
    const { container } = mountRules();
    await screen.findByText(t('rules.list.emptyTitle'));

    expect(await axe(container)).toHaveNoViolations();
  });
});
