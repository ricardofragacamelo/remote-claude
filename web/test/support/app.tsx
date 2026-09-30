import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import type { RenderResult } from '@testing-library/react';

import { routeTree } from '@/app/router';
import type { Locale } from '@/shared/i18n';
import { render } from './render';

/** The app as it is mounted, and where its router is. */
export type MountedApp = RenderResult & {
  readonly router: ReturnType<typeof createRouter<typeof routeTree>>;
  path(): string;
  search(): Readonly<Record<string, unknown>>;
};

/**
 * The real table of routes, frame and sign-in gate included, landed on `href` — what pasting the
 * link in the browser does.
 *
 * Screens are tested inside the frame they ship in: a screen rendered alone would pass without the
 * gate every screen now has in common (plan 06, B-18).
 */
export function mountApp(href: string, locale: Locale = 'en'): MountedApp {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  const mounted = render(<RouterProvider router={router} />, locale);

  return {
    ...mounted,
    router,
    path: () => router.state.location.pathname,
    search: () => router.state.location.search,
  };
}
