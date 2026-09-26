import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { realTranscriptSdk } from '@adapter/outbound/claude/transcript-sdk';

/**
 * The three reads of the **real** Agent SDK, against a store that is ours.
 *
 * `CLAUDE_CONFIG_DIR` points the SDK at an empty directory made for this suite, so nothing of the
 * machine's own history is read — the store of whoever runs the suite holds projects nobody
 * released for a test. It is set before the first call, because the SDK resolves the directory
 * once and remembers it.
 *
 * What it proves is what no scripted store can: that the binding reaches the SDK, and that the SDK
 * answers an absent conversation the way the adapter was built to expect — `undefined` from the
 * info and `[]` from the messages, which is why existence is asked of the info (S-56).
 */
describe('the Agent SDK`s reads of the store', () => {
  let workspace: string;

  beforeAll(() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rc-claude-store-'));
    workspace = path.join(directory, 'workspace');
    mkdirSync(workspace);
    mkdirSync(path.join(directory, 'config', 'projects'), { recursive: true });
    process.env['CLAUDE_CONFIG_DIR'] = path.join(directory, 'config');
  });

  const absent = '6b41b192-a41b-46c2-b8d7-000000000000';

  it('lists no conversation for a directory nothing ran in', async () => {
    await expect(
      realTranscriptSdk.listSessions({ dir: workspace, includeWorktrees: false }),
    ).resolves.toEqual([]);
  });

  it('describes an id that names nothing as `undefined`', async () => {
    await expect(realTranscriptSdk.getSessionInfo(absent)).resolves.toBeUndefined();
  });

  it('answers the messages of an id that names nothing as `[]` — the collision S-56 resolves', async () => {
    await expect(realTranscriptSdk.getSessionMessages(absent)).resolves.toEqual([]);
  });
});
