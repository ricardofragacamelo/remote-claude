import { expect, test } from '@playwright/test';

import { environment } from '../fixtures/environment';
import { submitCredentials } from '../fixtures/auth';
import { scenario } from '../scenarios';

/**
 * S-61 and S-37 — the walking skeleton, through the browser.
 *
 * ```
 * OIDC sign-in (PKCE, state validated)
 *  → the socket opens and the handshake is authenticated
 *  → diag.ping goes out
 *  → diag.pong comes back with a seq
 *  → the screen renders it, translated
 * ```
 *
 * Every layer of docs/plans/00-bootstrap/README.md is on that line: the provider, the backend's
 * four layers, PostgreSQL, the WebSocket contract and the `Component → Hook → Service → api.ts`
 * chain of the front. Nothing here imports `web/src` or `backend/src` — the system is reached
 * through the door a person uses, or the level proves nothing the integration suite did not.
 */

const shared = scenario('vertical-ping');
const expected = shared.expect as {
  connectionStatus: string;
  firstSeq: number;
  pingCounts: number[];
};

test.describe(`${shared.id} — ${shared.title}`, () => {
  test('signs in, opens the socket, pings, and renders the pong it gets back', async ({ page }) => {
    await page.goto('/');

    // Signed out is a screen, not a redirect loop: the shell waits for the refresh cookie to be
    // tried before it decides nobody is here.
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${environment.keycloakUrl}/**`);

    // S-37: the flow really is a redirect to the provider, and the `state` the app generated is
    // what comes back — a mismatch is refused in `completeLogin`, and the screen below never
    // appears.
    expect(page.url()).toContain('code_challenge_method=S256');
    await submitCredentials(page, shared.user);

    await page.waitForURL(`${environment.webUrl}/`);
    await expect(page.getByRole('button', { name: 'Send ping' })).toBeVisible();

    const status = page.getByTestId('connection-status');
    await expect(status).toHaveText(expected.connectionStatus === 'ready' ? 'Connected' : '');

    await page.getByRole('button', { name: 'Send ping' }).click();

    await expect(page.getByText(`Sequence ${String(expected.firstSeq)}`)).toBeVisible();
    await expect(page.getByText(`Pong ${String(expected.pingCounts[0])} at `)).toBeVisible();

    // The session the first ping opened is the one the second one lands on: the count goes up
    // rather than starting over, which is the whole point of the row in PostgreSQL.
    await page.getByRole('button', { name: 'Send ping' }).click();
    await expect(page.getByText(`Pong ${String(expected.pingCounts[1])} at `)).toBeVisible();

    await expect(page.getByText(/^Session /)).toBeVisible();
  });

  test('speaks the visitor’s language, and not the one the code was written in', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();

    await page.goto(environment.webUrl);

    // Nothing presentable is born hardcoded: the same screen, in the other catalogue.
    await expect(page.getByRole('heading', { name: 'Entre para continuar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    await context.close();
  });
});
