import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { CALLBACK_PATH } from '@/features/auth';
import { App } from './App';
import { AuditRoute, readAuditSearch } from './AuditRoute';
import { Callback } from './Callback';
import { RuleRoute } from './RuleRoute';
import { RulesRoute } from './RulesRoute';
import { SessionRoute } from './SessionRoute';

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

/**
 * The session on screen is in the **path**, not in state.
 *
 * The test the architecture states is simple: pasting the link on another device reproduces the
 * screen. A session held in a store would fail it.
 */
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: SessionRoute,
});

/** What the user authorised in advance, in a route of its own so revoking is one click away. */
const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: RulesRoute,
});

/** One rule by id, in any state — where a trail entry leads to the rule that answered it. */
const ruleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules/$ruleId',
  component: RuleRoute,
});

/** The trail, with its filters in the search so a filtered trail is a link. */
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  validateSearch: readAuditSearch,
  component: AuditRoute,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    callbackRoute,
    sessionRoute,
    rulesRoute,
    ruleRoute,
    auditRoute,
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
