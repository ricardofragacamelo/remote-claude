import { describe, expect, it } from 'vitest';

import { RegistryLiveLoadedState } from '@adapter/outbound/engines/claude/registry-live-loaded-state';
import { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import { ConversationRef } from '@domain/engine';
import { WorkspacePath } from '@domain/workspace';
import {
  aConversation,
  aSession,
  RecordingHandle,
} from '../../../../../support/builders/session.builder';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';

const OWNER = UserId.create('auth|owner');
const OTHER_USER = UserId.create('auth|someone-else');
const FOLDER = WorkspacePath.create('/srv/projects/app');

function registryWith(
  handle: RecordingHandle,
  overrides: { ownerId?: string; workspace?: string; engine?: string } = {},
): SessionRegistry {
  const registry = new SessionRegistry(10, new FixedClock(new Date('2026-10-20T00:00:00Z')));
  const session = aSession({
    ownerId: overrides.ownerId ?? OWNER.value,
    workspace: overrides.workspace ?? FOLDER.value,
  });
  const conversation =
    overrides.engine === undefined || overrides.engine === 'claude'
      ? aConversation()
      : {
          ref: ConversationRef.create(overrides.engine, '6b41b192-a41b-46c2-b8d7-5098d8c825be'),
          resumedFrom: null,
        };
  registry.add({ session, handle, conversation });
  return registry;
}

/** A handle with the Claude-only extra this adapter looks for, by shape. */
function handleWithMemoryFiles(paths: readonly string[]): RecordingHandle {
  const handle = new RecordingHandle();
  return Object.assign(handle, { loadedMemoryFiles: () => Promise.resolve(paths) });
}

describe('RegistryLiveLoadedState — plan 13, B-32, S-148', () => {
  it('answers the paths a live session of the caller, in the folder, says it loaded', async () => {
    const registry = registryWith(handleWithMemoryFiles(['/srv/projects/app/CLAUDE.md']));
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toEqual([
      '/srv/projects/app/CLAUDE.md',
    ]);
  });

  it('answers null with no live session of the caller at all', async () => {
    const registry = new SessionRegistry(10, new FixedClock(new Date('2026-10-20T00:00:00Z')));
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toBeNull();
  });

  it('answers null for a live session of someone else, even in the same folder', async () => {
    const registry = registryWith(handleWithMemoryFiles([]), { ownerId: OTHER_USER.value });
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toBeNull();
  });

  it('answers null for a live session in a different folder', async () => {
    const registry = registryWith(handleWithMemoryFiles([]), { workspace: '/srv/projects/other' });
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toBeNull();
  });

  it('answers null for a session of another engine in the same folder', async () => {
    const registry = registryWith(handleWithMemoryFiles([]), { engine: 'codex' });
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toBeNull();
  });

  it('answers null for a handle without the Claude-only extra at all — any other engine’s handle', async () => {
    const registry = registryWith(new RecordingHandle());
    const adapter = new RegistryLiveLoadedState(registry);

    await expect(adapter.loadedMemoryFiles(OWNER, FOLDER)).resolves.toBeNull();
  });
});
