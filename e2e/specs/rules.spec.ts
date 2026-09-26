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
      pattern: expect.stringMatching(/^Write\(.+\)$/),
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

    // Through the browser: sign in from the deep link, and come back to it.
    await openSignedIn(page, user, '/rules');

    const row = page.getByRole('listitem', { name: `Rule ${String(offered?.pattern)}` });
    await expect(row).toBeVisible();
    await expect(row.getByText('In one project')).toBeVisible();

    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(row).toBeHidden();

    // Gone from the list the server keeps too — revoked, not merely hidden by the screen.
    expect((await rulesOf(signedIn)).some((rule) => rule.id === granted?.id)).toBe(false);
  } finally {
    if (granted !== undefined) {
      await revokeQuietly(signedIn, granted.id);
    }
    await closeSession(socket, sessionId);
  }
});
