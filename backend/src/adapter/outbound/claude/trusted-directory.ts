import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { isPlainObject } from '@shared/utils/plain-object';

/**
 * Where the CLI keeps, among other things, which directories the user has trusted.
 *
 * `CLAUDE_CONFIG_DIR` wins when it is set, because that is what the CLI itself does: the spike
 * that measured this behaviour ran under an isolated one and left `~/.claude.json` byte for byte
 * unchanged. Reading the home file regardless would clear a mark in a file the CLI is not
 * reading — which looks exactly like clearing it and is not
 * ([B-45](../../../../../docs/plans/01-live-session/F0-contract.md)).
 */
export function configFile(
  home: string = homedir(),
  configDir: string | undefined = process.env['CLAUDE_CONFIG_DIR'],
): string {
  return configDir === undefined || configDir === ''
    ? path.join(home, '.claude.json')
    : path.join(configDir, '.claude.json');
}

/** What clearing the mark did, so the caller can log it honestly. */
export type TrustClearance = 'cleared' | 'notTrusted' | 'noConfig';

/**
 * Clears the trust mark of a directory before a session opens in it.
 *
 * **This is not a precaution.** It was measured on 2026-09-18, SDK `0.3.277`, with
 * `settingSources: ['project']` and a project `allow` rule: with `hasTrustDialogAccepted: true`
 * the tool ran and `canUseTool` was **never called** — no error, no warning, nobody asked. With
 * the mark absent, the callback was called as designed. Without this step the product has no human
 * approval at all, which is the product. See
 * docs/architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido.
 *
 * Clearing rather than refusing: refusing would lock out every directory the user has ever opened
 * in their own Claude Code, which is most of them. The user is asked to trust the directory again
 * in the CLI, which costs one dialog.
 *
 * The write is a temporary file plus a rename, because the user's own Claude Code may be writing
 * the same file: a rename is atomic, so a reader sees the old file or the new one and never a
 * half-written one. It cannot stop the other writer from overwriting us afterwards — nothing can,
 * short of a lock the CLI does not offer — and the session is opened on the state we just wrote.
 *
 * @returns what it found, for the caller to log
 */
export function clearTrustMark(directory: string, home: string = homedir()): TrustClearance {
  const file = configFile(home);
  let config: Record<string, unknown>;

  try {
    config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    // No config, or one we cannot parse. Nothing is trusted that we could clear, and inventing a
    // file here would overwrite whatever the CLI is about to write into it.
    return 'noConfig';
  }

  const projects = config['projects'];
  if (!isPlainObject(projects)) {
    return 'notTrusted';
  }

  const project = projects[directory];
  if (!isPlainObject(project) || project['hasTrustDialogAccepted'] !== true) {
    return 'notTrusted';
  }

  project['hasTrustDialogAccepted'] = false;

  const temporary = `${file}.remote-claude.${String(process.pid)}`;
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);

  return 'cleared';
}
