import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement, ReactNode } from 'react';
import type { RenderResult } from '@testing-library/react';

import { createI18n } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

/**
 * Renders with the providers the application really uses.
 *
 * The i18n instance is the **real** one, in `en`. Stubbing `t()` to return its own key would hide
 * a missing translation, which is precisely the bug these tests exist to catch —
 * docs/architecture/web/06-testing.md.
 */
export function render(ui: ReactElement, locale: Locale = 'en'): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const i18n = createI18n(locale);

  function Wrapper({ children }: { readonly children: ReactNode }): React.JSX.Element {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper });
}

/** The same catalogue the component resolves against, for an assertion to quote a key not a word. */
export function translator(
  locale: Locale = 'en',
): (key: string, params?: Record<string, unknown>) => string {
  const i18n = createI18n(locale);
  return (key, params) => i18n.t(key, { ...params });
}
