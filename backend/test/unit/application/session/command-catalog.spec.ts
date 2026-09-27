import { describe, expect, it } from 'vitest';

import { CommandCatalog } from '@application/session';
import type { LiveSession } from '@application/session';
import { ClaudeUnavailableError } from '@domain/session';
import {
  aCommand,
  aConversation,
  aSession,
  RecordingHandle,
} from '../../../support/builders/session.builder';

/** A live session on a workspace, over a handle that answers `commands` as version `version`. */
function live(
  workspace = '/srv/projects/app',
  version: string | null = '2.1.277',
  handle = new RecordingHandle(),
): LiveSession & { readonly handle: RecordingHandle } {
  handle.cliVersion = version;
  handle.commands = [aCommand('init')];
  return { session: aSession({ workspace }), handle, conversation: aConversation() };
}

/** A promise the test resolves, so two asks can be put in flight together. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

describe('CommandCatalog', () => {
  it('asks the CLI once for the same installation and workspace — S-35', async () => {
    const catalog = new CommandCatalog();
    const first = live();
    const second = live();

    await catalog.commandsOf(first);
    const listed = await catalog.commandsOf(second);

    expect(listed.map((command) => command.name)).toEqual(['init']);
    expect(first.handle.commandCalls).toBe(1);
    expect(second.handle.commandCalls).toBe(0);
  });

  it('asks again when the version of the CLI changes — S-35', async () => {
    const catalog = new CommandCatalog();
    const handle = new RecordingHandle();
    const before = live('/srv/projects/app', '2.1.277', handle);

    await catalog.commandsOf(before);
    handle.cliVersion = '2.1.300';
    handle.commands = [aCommand('init'), aCommand('brand-new')];
    const after = await catalog.commandsOf(before);

    expect(after.map((command) => command.name)).toEqual(['init', 'brand-new']);
    expect(handle.commandCalls).toBe(2);
  });

  it('keeps the list of one workspace apart from another', async () => {
    const catalog = new CommandCatalog();
    const here = live('/srv/projects/app');
    const there = live('/srv/projects/other');

    await catalog.commandsOf(here);
    await catalog.commandsOf(there);

    expect(here.handle.commandCalls).toBe(1);
    expect(there.handle.commandCalls).toBe(1);
  });

  it('makes one call for two sessions asking together — S-36', async () => {
    const catalog = new CommandCatalog();
    const first = live();
    const second = live();
    const { held, release } = gate();
    first.handle.commandsHeld = held;

    const both = Promise.all([catalog.commandsOf(first), catalog.commandsOf(second)]);
    release();
    const [left, right] = await both;

    expect(left).toBe(right);
    expect(first.handle.commandCalls + second.handle.commandCalls).toBe(1);
  });

  it('shares a list of unknown version while it is asked, and never keeps it', async () => {
    const catalog = new CommandCatalog();
    const first = live('/srv/projects/app', null);
    const second = live('/srv/projects/app', null);
    const { held, release } = gate();
    first.handle.commandsHeld = held;

    const together = Promise.all([catalog.commandsOf(first), catalog.commandsOf(second)]);
    release();
    await together;
    await catalog.commandsOf(second);

    expect(first.handle.commandCalls).toBe(1);
    expect(second.handle.commandCalls).toBe(1);
  });

  it('keeps no failure, so the next ask tries again — S-31', async () => {
    const catalog = new CommandCatalog();
    const session = live();
    session.handle.commandsFailWith = new ClaudeUnavailableError('01J0ABCDEFGHJKMNPQRSTVWXYZ');

    await expect(catalog.commandsOf(session)).rejects.toThrow(ClaudeUnavailableError);

    session.handle.commandsFailWith = null;
    const listed = await catalog.commandsOf(session);

    expect(listed).toHaveLength(1);
    expect(session.handle.commandCalls).toBe(2);
  });

  it('forgets the list nobody asked for longest, beyond its capacity — fron', async () => {
    const catalog = new CommandCatalog(2);
    const a = live('/srv/a');
    const b = live('/srv/b');
    const c = live('/srv/c');

    await catalog.commandsOf(a);
    await catalog.commandsOf(b);
    await catalog.commandsOf(a);
    await catalog.commandsOf(c);
    await catalog.commandsOf(a);
    await catalog.commandsOf(b);

    // `b` was the least recently used when `c` arrived, so it is the one asked again.
    expect(a.handle.commandCalls).toBe(1);
    expect(b.handle.commandCalls).toBe(2);
    expect(c.handle.commandCalls).toBe(1);
  });
});
