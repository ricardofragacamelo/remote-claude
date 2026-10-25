import { beforeEach, describe, expect, it } from 'vitest';

import { TranscriptAudience } from '@application/transcript';
import { UserId } from '@domain/auth';
import { aWorkspace, anAllowlist, OWNER } from '../../../support/builders/workspace.builder';
import { aTranscriptSession, conversationId } from '../../../support/builders/transcript.builder';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const owner = UserId.create(OWNER);

describe('TranscriptAudience.resolved — a folder remembered once, for every read after — S-163', () => {
  let store: InMemoryTranscriptStore;
  let audience: TranscriptAudience;

  beforeEach(() => {
    store = new InMemoryTranscriptStore();
    // A root broad enough that it is never the conversation's own folder exactly — the allowlist
    // fallback of `resolved` cannot find it, so only what was remembered can.
    audience = new TranscriptAudience(
      { current: () => anAllowlist([aWorkspace({ root: '/srv/projects' })]) },
      { openersOf: () => Promise.resolve(new Map()) },
      { liveSessionOf: () => null },
      { clock: new FixedClock(new Date(0)), activeWindowMs: 120_000 },
    );
  });

  it('remembers a folder a listing already resolved, for a read that cannot resolve it on its own', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));
    await audience.shown(await store.list('/srv/projects/app'), owner);

    const unresolved = aTranscriptSession({ id: 1, cwd: null });
    const resolved = await audience.resolved(store, unresolved, owner);

    expect(resolved.cwd).toBe('/srv/projects/app');
  });

  it('remembers a folder resolved by a hint, for a later caller with no hint of its own', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));
    const unresolved = aTranscriptSession({ id: 1, cwd: null });

    await audience.resolved(store, unresolved, owner, '/srv/projects/app');
    const again = await audience.resolved(store, unresolved, owner);

    expect(again.cwd).toBe('/srv/projects/app');
  });

  it('two conversations are remembered apart', async () => {
    store
      .add('/srv/projects/app', aTranscriptSession({ id: 1 }))
      .add('/srv/projects/other', aTranscriptSession({ id: 2, cwd: '/srv/projects/other' }));
    await audience.shown(await store.list('/srv/projects/app'), owner);
    await audience.shown(await store.list('/srv/projects/other'), owner);

    const resolved = await audience.resolved(store, aTranscriptSession({ id: 2, cwd: null }), owner);

    expect(resolved.cwd).toBe('/srv/projects/other');
  });

  it('answers with no folder, and remembers nothing, when none can be found', async () => {
    const unresolved = aTranscriptSession({ id: conversationId(9), cwd: null });

    const resolved = await audience.resolved(store, unresolved, owner);

    expect(resolved.cwd).toBeNull();
  });
});
