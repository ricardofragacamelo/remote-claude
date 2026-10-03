import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { startConversation } from '../fixtures/history';
import { connected, workspaceFor } from '../fixtures/live-session';
import { answeredUntilTheTurnEnds, endedWithEveryMessageKnown } from '../fixtures/live-turns';
import { scenario } from '../scenarios';

/**
 * 04·S-52 — the commands of the real installation, and a real `/init` — plan 04, F5 (B-25).
 *
 * The one test that notices the CLI changing how it behaves before a user does: the menu is read
 * from `supportedCommands()` of a live session, never from a list of ours, and `/init` has to finish
 * after going through the same permission flow as any other write.
 *
 * `/init` **writes into the project**, so it runs against a repository made for this run
 * ([D-07](../../docs/plans/04-transcript-and-resume/decisions.md#d-07--onde-o-init-pode-escrever)):
 * `git init` in a folder of its own inside the allowlist, a file, a commit — and gone at the end.
 * Never a fixed repository, which would find the `CLAUDE.md` of the run before, and never ours.
 *
 * Not the words: what the model writes is different every run. What is asserted is the shape —
 * the command is on the menu, a write of the file was asked for and allowed, the turn ended, the file
 * is there, and every message of the turn was one this build recognises.
 */

const live = scenario('live-commands');
const context = workspaceFor(live.user);

/** The tools that write a file, and so the only ones this test lets through. */
const WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/** What the menu answers, as the contract states it. */
interface Menu {
  readonly cliVersion: string | null;
  readonly commands: readonly { readonly name: string; readonly suggested: boolean }[];
}

/** Runs git in [directory], with an identity of its own — never the machine's. */
function git(directory: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=smoke-live', '-c', 'user.email=smoke-live@example.invalid', ...args],
    { cwd: directory, stdio: 'ignore' },
  );
}

/** A repository made for this run: two files and one commit, inside the root given. */
function throwawayRepository(root: string): string {
  const directory = fs.mkdtempSync(path.join(root, 'rc-init-'));

  fs.writeFileSync(path.join(directory, 'README.md'), '# tally\n\nCounts the words it is given.\n');
  fs.writeFileSync(
    path.join(directory, 'tally.js'),
    "console.log((process.argv[2] ?? '').split(/\\s+/).filter(Boolean).length);\n",
  );
  git(directory, 'init', '--quiet');
  git(directory, 'add', '.');
  git(directory, 'commit', '--quiet', '-m', 'The only commit');

  return directory;
}

/** Whether [candidate] is a path inside [directory]. */
function inside(directory: string, candidate: unknown): boolean {
  if (typeof candidate !== 'string') {
    return false;
  }

  const relative = path.relative(directory, path.resolve(directory, candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

test(`${live.id} — ${live.title}`, async () => {
  const expected = live.expect as { command: string; toolName: string; file: string };
  const repository = throwawayRepository(context().workspace);
  const socket = await connected(context().user);

  try {
    const { sessionId } = await startConversation(socket, repository);

    // The menu of this installation — whatever it holds today, with the command among the
    // suggested. Read before any turn, as a person opening it first would.
    const menu = (await (
      await callApi(context().user, `/sessions/${sessionId}/commands`)
    ).json()) as Menu;
    expect(menu.commands.length).toBeGreaterThan(0);
    expect(menu.commands.find((command) => command.name === expected.command)).toMatchObject({
      suggested: true,
    });
    expect(menu.commands.some((command) => command.name.startsWith('__'))).toBe(false);

    // Of the questions the real `/init` asks, only a write inside the repository is let through.
    const mark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: `/${expected.command}` });
    const { asked } = await answeredUntilTheTurnEnds(
      socket,
      (question) =>
        WRITING_TOOLS.has(question.toolName) &&
        inside(repository, (question.input as { file_path?: unknown } | undefined)?.file_path),
      'smoke-live lets through only the write of /init',
      mark,
    );

    expect(asked).toContain(`${expected.toolName}:true`);
    expect(fs.existsSync(path.join(repository, expected.file))).toBe(true);

    // Once a turn has run, the version is the one the CLI itself reported.
    const after = (await (
      await callApi(context().user, `/sessions/${sessionId}/commands`)
    ).json()) as Menu;
    expect(after.cliVersion).toMatch(/^\d+\.\d+\.\d+/);

    await endedWithEveryMessageKnown(socket, sessionId);
  } finally {
    socket.close();
    fs.rmSync(repository, { recursive: true, force: true });
  }
});
