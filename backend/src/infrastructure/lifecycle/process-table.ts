import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** One running process, as much of it as the sweep needs. */
export interface ProcessEntry {
  readonly pid: number;
  readonly environment: ReadonlyMap<string, string>;
}

/**
 * The processes of this machine, behind a port, so the rule that picks orphans is tested without
 * spawning any and the part that does spawn them is one small class.
 */
export interface ProcessTable {
  /** Every process whose environment this user may read, or `null` where that cannot be asked. */
  list(): Promise<readonly ProcessEntry[] | null>;

  /** Whether a process with that pid exists. */
  isAlive(pid: number): boolean;

  /** Asks it to stop. A process that is already gone is not an error. */
  signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void;
}

const NUMERIC = /^\d+$/;

/**
 * The process table as Linux exposes it, under `/proc`.
 *
 * `/proc/<pid>/environ` is readable by the process's own user, which is exactly the reach the
 * sweep should have: it can find what this user started and nothing else. A process that vanishes
 * between the listing and the read, or belongs to somebody else, is skipped — not an error.
 *
 * Where there is no `/proc` (macOS), {@link list} answers `null`, and the sweep says it could not
 * look rather than pretending it found nothing.
 */
export class ProcfsProcessTable implements ProcessTable {
  constructor(private readonly root: string = '/proc') {}

  async list(): Promise<readonly ProcessEntry[] | null> {
    let names: string[];

    try {
      names = await readdir(this.root);
    } catch {
      return null;
    }

    const entries = await Promise.all(
      names.filter((name) => NUMERIC.test(name)).map((name) => this.read(Number(name))),
    );

    return entries.filter((entry): entry is ProcessEntry => entry !== null);
  }

  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // `EPERM` is a process that exists and is somebody else's: alive, and not ours to touch.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    try {
      process.kill(pid, signal);
    } catch {
      // Gone between the look and the signal: what the signal was for has already happened.
    }
  }

  private async read(pid: number): Promise<ProcessEntry | null> {
    try {
      const raw = await readFile(path.join(this.root, String(pid), 'environ'), 'utf8');
      return { pid, environment: parseEnviron(raw) };
    } catch {
      return null;
    }
  }
}

/** `KEY=value` pairs separated by NUL, as `/proc/<pid>/environ` holds them. */
export function parseEnviron(raw: string): ReadonlyMap<string, string> {
  const environment = new Map<string, string>();

  for (const pair of raw.split('\0')) {
    const equals = pair.indexOf('=');

    if (equals > 0) {
      environment.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
  }

  return environment;
}
