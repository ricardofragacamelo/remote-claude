import { screen, within } from '@testing-library/react';

import type { LiveSocket } from './live-socket';
import { translator } from './render';
import { typeIn } from './workbench';

const t = translator('en');
const AT = '2026-09-30T12:00:00.000Z';

/**
 * The generic name the side bar carries with nothing to name it by its own engine — no `/engines`
 * mocked, or a tab whose conversation the fixture never names (plan 28, B-44).
 */
export const NO_AGENT_KNOWN = t('engine.name.fallback');

/**
 * The panel of the agent beside the editor — named [name], the generic fallback unless the spec
 * mocks `/engines` and names its own conversation's engine (plan 28, B-44).
 */
export function agentAside(name: string = NO_AGENT_KNOWN): HTMLElement {
  return screen.getByRole('complementary', { name });
}

/** `session.started`, as the hub answers the `session.start` of id `correlationId`. */
export function startedFrame(
  correlationId: unknown,
  sessionId: string,
  workspacePath: string,
): Record<string, unknown> {
  return {
    v: 1,
    id: `started-${sessionId}`,
    kind: 'event',
    type: 'session.started',
    ts: AT,
    seq: 1,
    correlationId,
    payload: { sessionId, workspacePath, model: 'claude-sonnet-5', permissionMode: 'ask' },
  };
}

/**
 * Opens a session the way a person does in the panel (plan 08, D-07): the first prompt of the draft
 * goes, the server opens the session — and the panel shows it.
 */
export async function startFromDraft(
  user: Parameters<typeof typeIn>[0] & { click(element: Element): Promise<void> },
  live: LiveSocket,
  session: { readonly id: string; readonly folder: string; readonly text?: string },
  agentName: string = NO_AGENT_KNOWN,
): Promise<void> {
  const aside = await screen.findByRole('complementary', { name: agentName });
  await typeIn(
    user,
    await within(aside).findByLabelText(t('composer.box.label')),
    session.text ?? 'hello',
  );
  await user.click(within(aside).getByRole('button', { name: t('session.composer.send') }));

  live.receive(startedFrame(live.lastSent('session.start')?.['id'], session.id, session.folder));
  await within(agentAside(agentName)).findByRole('region', {
    name: t('session.screen.sessionLabel', { sessionId: session.id }),
  });
}
