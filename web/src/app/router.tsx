import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { CALLBACK_PATH } from '@/features/auth';
import { App } from './App';
import { Callback } from './Callback';

/**
 * The routes.
 *
 * What is navigable lives in the URL, not in state — the test is whether pasting the link on
 * another device reproduces the screen. See docs/architecture/web/04-state-and-data.md.
 */
const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: App });

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CALLBACK_PATH,
  component: Callback,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, callbackRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
