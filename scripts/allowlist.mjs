#!/usr/bin/env node
/**
 * Frees a folder of this machine for Claude — without editing a YAML file by hand, and without
 * putting the folder's path in the repository.
 *
 *   pnpm allowlist add ~/projects/remote-claude   free it for the users of the development realm
 *   pnpm allowlist list                            the allowlist `pnpm dev` runs with, and its roots
 *   pnpm allowlist remove ~/projects/remote-claude
 *
 * It writes `infra/workspace-allowlist.local.yaml`, a copy of the default that git ignores,
 * validated by the schema the backend boots with, and then sends `SIGHUP` to the backend of
 * `pnpm dev`, which reloads the list without restarting. The filesystem root is refused; the home
 * folder is asked about first. See docs/plans/06-workbench/F1-directory-browse.md#b-10.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

import { LOCAL_ALLOWLIST_FILE, pidFileOf } from './lib/allowlist.mjs';
import { runAllowlist } from './lib/allowlist-command.mjs';
import { repoRoot } from './lib/paths.mjs';
import { loadDotEnv } from './lib/stack.mjs';
import { ALLOWLIST_FILE } from './lib/workspaces.mjs';

// The pid file and a hand-set allowlist are both in `.env`, like everything `pnpm dev` reads.
loadDotEnv(repoRoot);

process.exitCode = await runAllowlist(process.argv.slice(2), {
  root: repoRoot,
  defaultFile: ALLOWLIST_FILE,
  localFile: LOCAL_ALLOWLIST_FILE,
  env: process.env,
  home: os.homedir(),
  cwd: process.cwd(),
  pidFile: pidFileOf(process.env, repoRoot),
  // An input that ends without an answer — no terminal, nothing piped — is a "no", never a wait.
  ask: (question) =>
    new Promise((resolve) => {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });

      terminal.once('close', () => {
        resolve('');
      });
      terminal.question(question).then(
        (answer) => {
          resolve(answer);
          terminal.close();
        },
        () => {
          resolve('');
        },
      );
    }),
  processes: {
    read: (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
    commandOf: (pid) => {
      try {
        return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' });
      } catch {
        return null;
      }
    },
    kill: (pid, signal) => {
      process.kill(pid, signal);
    },
  },
});
