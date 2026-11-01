import fs from 'node:fs';

/**
 * The real OS processes of a `smoke-live` run, read off `/proc` — Linux only, the same way
 * `scripts/claude-config-spike.mjs` (plan 13, B-01) measures a secret's absence from the CLI's own
 * `cmdline`. This file never imports that script (a CLI entry point, not a library); it ports the
 * one thing `smoke-live` also needs, kept here so a spec does not read `/proc` by hand.
 */

/** One process found under `/proc`, before it is filtered to the ones that matter. */
export interface ProcEntry {
  readonly pid: number;
  readonly cmdline: string;
  readonly status: string;
}

/** A process of interest, with its command line split apart. */
export interface LiveProcess {
  readonly pid: number;
  readonly argv: readonly string[];
}

/** Every process on this machine right now, best-effort — one that ends mid-read is skipped. */
export function procEntries(): readonly ProcEntry[] {
  const entries: ProcEntry[] = [];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      entries.push({
        pid: Number(name),
        cmdline: fs.readFileSync(`/proc/${name}/cmdline`, 'utf8'),
        status: fs.readFileSync(`/proc/${name}/status`, 'utf8'),
      });
    } catch {
      // The process ended between the listing and the read — never one this suite started.
    }
  }
  return entries;
}

/**
 * The processes whose argv carries every one of `needles` — a fixture MCP server is found this
 * way, by its script path and its `--name`, since a `smoke-live` spec has no way to learn the
 * engine's own session id from outside the backend (plan 13, B-46).
 */
export function processesMatching(
  entries: readonly ProcEntry[],
  needles: readonly string[],
): readonly LiveProcess[] {
  return entries
    .map((entry) => ({
      pid: entry.pid,
      argv: entry.cmdline.split('\0').filter((arg) => arg !== ''),
    }))
    .filter((entry) => needles.every((needle) => entry.argv.some((arg) => arg.includes(needle))));
}

/** Whether a secret appears anywhere on a command line — whole, or inside the JSON of a flag. */
export function argvCarries(argv: readonly string[], secret: string): boolean {
  return argv.some((arg) => arg.includes(secret));
}
