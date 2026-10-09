import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { WorkspacePath } from '@domain/workspace';
import { SingleFlight } from '@application/shared';
import type {
  InstallationAnswer,
  InstallationProbe,
  LiveInstallation,
} from './ports/installation.ports';

/** How many folders' answers the catalogue keeps — a machine has a handful. */
export const CATALOGUE_CAPACITY = 16;

/**
 * How long what the installation says about the **account** is trusted. The version of the CLI does
 * not change when somebody logs in again, so the key alone would keep an old account forever
 * (plan 13, D-05) — a minute is short enough for "I just ran /login" and long enough for one screen.
 */
export const ACCOUNT_TTL_MS = 60_000;

interface Remembered extends InstallationAnswer {
  readonly at: number;
}

/**
 * What the installation says about itself — models, agents, commands, output styles, the account —
 * asked once and remembered (plan 13, B-10), generalising the `CommandCatalog` of plan 04.
 *
 * - **a live session of the caller in the folder answers first**, with no probe (S-16);
 * - otherwise **one probe** per key, closed in its `finally` — two screens asking together make one
 *   (S-18);
 * - keyed by **the version of the CLI the SDK spawns, the configuration directory and the folder**:
 *   the `.claude/` of a project brings agents, commands and styles of its own; a new version asks
 *   again (S-19);
 * - a failure is never kept, and neither is an answer whose version is unknown (S-20).
 */
export class ClaudeInstallationCatalog {
  private readonly answers = new Map<string, Remembered>();
  private readonly asking = new SingleFlight<InstallationAnswer>();

  /** The version the keys are made with: the manifest's, until the CLI says its own. */
  private cliVersion: string | null;

  constructor(
    private readonly live: LiveInstallation,
    private readonly probe: InstallationProbe,
    private readonly clock: Clock,
    private readonly key: { readonly cliVersion: string | null; readonly configDir: string },
  ) {
    this.cliVersion = key.cliVersion;
  }

  /**
   * @param fresh the account has to be read again — `GET /claude/account?refresh=true` (S-26)
   * @throws whatever the live session or the probe threw — and then nothing was kept
   */
  async of(userId: UserId, folder: WorkspacePath, fresh = false): Promise<InstallationAnswer> {
    const live = await this.live.initializationOf(userId, folder);

    if (live !== null) {
      this.remember(folder, live);
      return live;
    }

    const known = this.answers.get(this.keyOf(folder));
    if (known !== undefined && !this.stale(known, fresh)) {
      return known;
    }

    return this.probeOnce(folder);
  }

  /** The answer remembered for a folder, without asking anybody — or `null`. */
  known(folder: WorkspacePath): InstallationAnswer | null {
    return this.answers.get(this.keyOf(folder)) ?? null;
  }

  /** The most recent answer for any folder — what the diagnostic says of the login without a probe. */
  latest(): InstallationAnswer | null {
    let latest: Remembered | null = null;
    for (const answer of this.answers.values()) {
      if (latest === null || answer.at > latest.at) latest = answer;
    }
    return latest;
  }

  private stale(known: Remembered, fresh: boolean): boolean {
    return fresh || this.clock.now().getTime() - known.at > ACCOUNT_TTL_MS;
  }

  private probeOnce(folder: WorkspacePath): Promise<InstallationAnswer> {
    return this.asking.run(this.keyOf(folder), () =>
      this.probe.probe(folder).then((answer) => {
        this.remember(folder, answer);
        return answer;
      }),
    );
  }

  private remember(folder: WorkspacePath, answer: InstallationAnswer): void {
    if (answer.cliVersion === null) {
      return;
    }

    // The CLI's own word corrects the manifest's: the next question asks by the version that runs.
    this.cliVersion = answer.cliVersion;
    const key = this.keyOf(folder);
    this.answers.delete(key);
    this.answers.set(key, { ...answer, at: this.clock.now().getTime() });

    for (const oldest of this.answers.keys()) {
      if (this.answers.size <= CATALOGUE_CAPACITY) break;
      this.answers.delete(oldest);
    }
  }

  private keyOf(folder: WorkspacePath): string {
    return JSON.stringify([this.cliVersion, this.key.configDir, folder.value]);
  }
}
