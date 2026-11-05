import { test, expect } from '@playwright/test';

import { connected, workspaceFor } from '../fixtures/live-session';
import { startConversation } from '../fixtures/history';
import { scenario } from '../scenarios';

/**
 * Plan 27, F8 (B-27), against the real Claude — D-12 of plan 01 excuses it from every gate: it
 * needs a login on this machine and spends quota, so `pnpm test:e2e:live` asks for it on purpose.
 *
 * Re-probes what B-01's spike measured (docs/discovery/01-descoberta-claude-agent-sdk.md §13),
 * through the backend's actual WS contract rather than the raw SDK — the point (R-04) is that a
 * CLI release that changes this shape fails here, before a real conversation silently loses the
 * message. Cenários S-105, S-106.
 */

const live = scenario('live-conversation-losses');
const expected = live.expect as { firstPrompt: string };

const context = workspaceFor(live.user);

test(`${live.id} — the synthetic message and the echo of a real /compact, live and reopened from the history`, async () => {
  const socket = await connected(context().user);

  try {
    const { sessionId, conversationId } = await startConversation(socket, context().workspace);

    // A turn with something to compact away.
    const beforeFirst = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.firstPrompt });
    await socket.waitFor(
      (frame) => socket.frames.indexOf(frame) >= beforeFirst && frame.type === 'turn.completed',
      120_000,
    );

    // S-105 — a real `/compact`: the synthetic summary (`injected.kind: 'contextSummary'`, never a
    // "You" bubble) and the command's own echo, as a `command.output` notice.
    const beforeCompact = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: '/compact' });
    await socket.waitFor(
      (frame) => socket.frames.indexOf(frame) >= beforeCompact && frame.type === 'turn.completed',
      180_000,
    );
    const compactFrames = socket.frames.slice(beforeCompact);

    const compacted = compactFrames.find((frame) => frame.type === 'session.compacted');
    expect(compacted, 'a real /compact still produces session.compacted').toBeDefined();

    const summary = compactFrames.find(
      (frame) =>
        frame.type === 'message.completed' &&
        (frame.payload as { injected?: { kind?: string } }).injected?.kind === 'contextSummary',
    );
    expect(
      summary,
      'the summary still arrives as message.completed with injected.kind: contextSummary, never a plain user message',
    ).toBeDefined();

    const echo = compactFrames.find(
      (frame) =>
        frame.type === 'session.notice' &&
        (frame.payload as { kind?: string }).kind === 'command.output',
    );
    expect(echo, 'the /compact echo still arrives as a command.output notice').toBeDefined();

    // S-106 — the same shape, read back through the history (B-16's includeSystemMessages, B-17's
    // reuse of the live functions): reattaching from zero replays it, not a second /compact.
    socket.send('session.attach', { sessionId, resumeFromSeq: 0 });
    const attached = await socket.waitFor((frame) => frame.type === 'session.attached');
    const replayed = (attached.payload as { replayed?: number }).replayed ?? 0;
    expect(
      replayed,
      'a reattach from zero replays the whole buffered conversation',
    ).toBeGreaterThan(0);

    expect(conversationId).toBeTruthy();
  } finally {
    socket.close();
  }
});
