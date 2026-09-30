import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DOCUMENTATION_URL } from '@/features/about';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { config } from '@/shared/config/env';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const versions = {
  backend: { version: '0.4.0', reason: null },
  agentSdk: { version: '0.2.7', reason: null },
  claudeCli: { version: null, reason: 'notInstalled' },
  node: { version: '24.16.0', reason: null },
};

/** The backend answers the versions as the test says; everything else, never. */
function versionsAre(answer: () => Promise<unknown>): void {
  vi.spyOn(api, 'get').mockImplementation((path: string) =>
    path === '/diag/versions' ? answer() : new Promise(() => undefined),
  );
}

function row(name: string): HTMLElement {
  return screen.getByText(name).nextElementSibling as HTMLElement;
}

describe('About — plan 06, B-32', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows the version of every part of the installation — S-148', async () => {
    versionsAre(() => Promise.resolve(versions));

    mountApp('/about');

    expect(await screen.findByText('0.4.0')).toBeVisible();
    expect(row(t('about.version.web'))).toHaveTextContent(config.appVersion);
    expect(row(t('about.version.agentSdk'))).toHaveTextContent('0.2.7');
    expect(row(t('about.version.node'))).toHaveTextContent('24.16.0');
  });

  it('says why a version could not be read, instead of leaving it out — S-204', async () => {
    versionsAre(() => Promise.resolve(versions));

    mountApp('/about');

    await screen.findByText('0.4.0');
    expect(row(t('about.version.claudeCli'))).toHaveTextContent(t('about.version.notInstalled'));
  });

  it('copies the whole block, in the language on screen, for a bug report — S-148', async () => {
    versionsAre(() => Promise.resolve(versions));
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mountApp('/about');

    await user.click(await screen.findByRole('button', { name: t('about.versions.copy') }));

    expect(writeText).toHaveBeenCalledWith(
      [
        `${t('about.version.web')}: ${config.appVersion}`,
        `${t('about.version.backend')}: 0.4.0`,
        `${t('about.version.agentSdk')}: 0.2.7`,
        `${t('about.version.claudeCli')}: ${t('about.version.notInstalled')}`,
        `${t('about.version.node')}: 24.16.0`,
      ].join('\n'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(t('about.versions.copied'));
  });

  it('says to copy by hand when the browser refuses — S-204', async () => {
    versionsAre(() => Promise.resolve(versions));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    mountApp('/about');

    await user.click(await screen.findByRole('button', { name: t('about.versions.copy') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('about.versions.copyFailed'));
  });

  it('keeps the web’s version on screen, and offers to try again, when the backend cannot be reached — S-204', async () => {
    let attempt = 0;
    versionsAre(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't'))
        : Promise.resolve(versions);
    });
    const user = userEvent.setup();
    mountApp('/about');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('common.error.offline'));
    expect(row(t('about.version.web'))).toHaveTextContent(config.appVersion);
    expect(screen.queryByRole('button', { name: t('about.versions.copy') })).toBeNull();

    await user.click(within(alert).getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('0.4.0')).toBeVisible();
  });

  it('shows the loading state while the versions are on their way', async () => {
    versionsAre(() => new Promise(() => undefined));

    mountApp('/about');

    expect(await screen.findByLabelText(t('about.versions.loading'))).toBeInTheDocument();
  });

  it('leads to the documentation in a new tab, and says the repository declares no license', async () => {
    versionsAre(() => Promise.resolve(versions));

    mountApp('/about');

    const docs = await screen.findByRole('link', { name: /Documentation/ });
    expect(docs).toHaveAttribute('href', DOCUMENTATION_URL);
    expect(docs).toHaveAttribute('target', '_blank');
    expect(screen.getByText(t('about.project.license'))).toBeVisible();
  });

  it('is reached from the palette — B-32', async () => {
    versionsAre(() => Promise.resolve(versions));
    const user = userEvent.setup();
    const mounted = mountApp('/rules');
    await screen.findByRole('menuitem', { name: t('fileMenu.file.title') });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: t('palette.dialog.title') });
    await user.type(within(dialog).getByRole('combobox'), ' about{Enter}');

    await waitFor(() => {
      expect(mounted.path()).toBe('/about');
    });
  });

  it('has no accessibility violation', async () => {
    versionsAre(() => Promise.resolve(versions));
    const { container } = mountApp('/about');
    await screen.findByText('0.4.0');

    expect(await axe(container)).toHaveNoViolations();
  });
});
