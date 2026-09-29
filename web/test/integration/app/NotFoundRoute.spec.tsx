import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { routeTree } from '@/app/router';
import type { Locale } from '@/shared/i18n';
import { render, translator } from '../../support/render';

/** The real table of routes, on the address somebody pasted. */
function mountAt(href: string, locale: Locale = 'en') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
  });

  return render(<RouterProvider router={router} />, locale);
}

describe('an address nobody answers — plan 06, S-07', () => {
  it.each(['en', 'pt-BR'] as const)(
    'says so in %s, with the way back',
    async (language) => {
      const t = translator(language);

      mountAt('/claude', language);

      expect(
        await screen.findByRole('heading', { name: t('common.notFound.title') }),
      ).toBeInTheDocument();
      expect(screen.getByText(t('common.notFound.description'))).toBeInTheDocument();
      expect(screen.getByRole('link', { name: t('common.notFound.home') })).toHaveAttribute(
        'href',
        '/',
      );
    },
    15_000,
  );

  it('renders no link into the reserved address, and no empty frame', async () => {
    const t = translator('en');
    const { container } = mountAt('/usage/2026-09');

    await screen.findByRole('heading', { name: t('common.notFound.title') });

    const hrefs = within(container)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(
      hrefs.filter((href) => href?.startsWith('/claude') || href?.startsWith('/usage')),
    ).toEqual([]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
