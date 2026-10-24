import { describe, expect, it } from 'vitest';

import { liveClaudeSessionOf } from '@adapter/outbound/engines/claude/live-claude-session';
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
  registry.add({ session, handle: new RecordingHandle(), conversation });
  return registry;
}

describe('liveClaudeSessionOf — plan 13, S-16, B-32', () => {
  it('finds the live Claude session of the caller, in the folder', () => {
    const registry = registryWith();
    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeDefined();
  });

  it('is undefined with no live session at all', () => {
    const registry = new SessionRegistry(10, new FixedClock(new Date('2026-10-20T00:00:00Z')));
    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeUndefined();
  });

  it('is undefined for a session of someone else, even in the same folder', () => {
    const registry = registryWith({ ownerId: OTHER_USER.value });
    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeUndefined();
  });

  it('is undefined for a session in a different folder', () => {
    const registry = registryWith({ workspace: '/srv/projects/other' });
    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeUndefined();
  });

  it('is undefined for a session of another engine, even owned and in the same folder', () => {
    const registry = registryWith({ engine: 'codex' });
    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeUndefined();
  });

  it('is undefined once the session has closed', () => {
    const registry = registryWith();
    const [live] = registry.all();
    live!.session.close('closedByUser');

    expect(liveClaudeSessionOf(registry, OWNER, FOLDER)).toBeUndefined();
  });
});
