import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { openSignedIn } from '../fixtures/auth';
import {
  closeSession,
  connected,
  permissionAsked,
  prompt,
  startSession,
  workspaceFor,
} from '../fixtures/live-session';
import { environment } from '../fixtures/environment';
import { revokeQuietly, rulesOf } from '../fixtures/rules';
import type { ListedRule } from '../fixtures/rules';

/**
 * The rules screen of plan 03, F1, through the doors a person uses (S-68).
 *
 * The question offers "don't ask again" **with** the rule it would grant — the pattern and the
 * lifetime, from the server ([D-12](../../docs/plans/03-rules-and-audit/decisions.md)) — answering
 * with it leaves that very rule, and the browser's `/rules` takes it back with one click. The whole
 * cycle — the next request not asking, and asking again after the revocation — is F4's (S-41,
 * S-42); this is the half the screens own.
 *
 * The answer is `project` and not `always`: a rule that survived a failed run would answer
 * requests of every later spec on this stack, and a project rule at least stays in this workspace.
 * The `finally` takes it back whatever happened.
 */

const user = { username: 'dev', password: 'dev' };
const context = workspaceFor(user);

/** One suggestion of `permission.requested`, as the contract describes it. */
interface Suggestion {
  readonly scope: string;
  readonly labelKey: string;
  readonly pattern?: string;
  readonly lifetimeMs?: number;
}

test('S-68 — the scope the question offers becomes the rule /rules lists, and revoking there takes it off', async ({
  page,
}) => {
  const signedIn = context().user;
  const socket = await connected(signedIn);
  const sessionId = await startSession(socket, context().workspace);
  let granted: ListedRule | undefined;

  try {
    prompt(socket, sessionId, 'tool-turn');
    const request = await permissionAsked(socket);
    const payload = request.payload as { requestId: string; suggestions: readonly Suggestion[] };

    // The reach and the lifetime travel with the offer, so the screen can say them in full.
    const offered = payload.suggestions.find((suggestion) => suggestion.scope === 'project');
    expect(offered).toMatchObject({
      labelKey: 'permission.scope.project',
      pattern: expect.stringMatching(/^file\.[a-z]+\(.+\)$/),
      lifetimeMs: expect.any(Number),
    });
    expect(payload.suggestions.map((suggestion) => suggestion.scope)).toEqual([
      'once',
      'session',
      'project',
      'always',
    ]);

    socket.respond(request, { requestId: payload.requestId, decision: 'allow', scope: 'project' });
    await socket.waitFor(
      (frame: Envelope) =>
        frame.type === 'permission.resolved' &&
        (frame.payload as { requestId?: string }).requestId === payload.requestId,
    );

    // The rule granted is the rule offered — the same pattern, not a wider one.
    granted = (await rulesOf(signedIn)).find((rule) => rule.pattern === offered?.pattern);
    expect(granted).toMatchObject({ scope: 'project', status: 'active' });

    // Through the browser: the list, then the rule's own detail (B-21/B-22) — a desktop table row
    // now, not the plain list item plan 03 drew; its own folder cell shows the folder's own name,
    // never the generic "In one project" the wizard's own picker still says (plan 15, B-21).
    await openSignedIn(page, user, '/rules?tab=active&sort=grantedAt&order=desc');
    const folderName = context().workspace.split('/').filter(Boolean).pop() ?? context().workspace;

    const patternCell = page.getByText(String(offered?.pattern), { exact: true });
    await expect(patternCell).toBeVisible();
    const row = patternCell.locator('xpath=ancestor::tr');
    await expect(row.getByText(folderName, { exact: true })).toBeVisible();

    await row.dblclick();
    await page.waitForURL(`**/rules/${String(granted?.id)}*`);
    await page.getByRole('button', { name: 'Revoke' }).click();

    await page.goto(`${environment.webUrl}/rules?tab=active&sort=grantedAt&order=desc`);
    await expect(page.getByText(String(offered?.pattern), { exact: true })).toBeHidden();

    // Gone from the list the server keeps too — revoked, not merely hidden by the screen.
    expect((await rulesOf(signedIn)).some((rule) => rule.id === granted?.id)).toBe(false);
  } finally {
    if (granted !== undefined) {
      await revokeQuietly(signedIn, granted.id);
    }
    await closeSession(socket, sessionId);
  }
});
