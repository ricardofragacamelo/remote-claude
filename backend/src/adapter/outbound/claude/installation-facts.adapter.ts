import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import type { InstallationFacts, ReadVersion } from '@application/claude-config';
import type { Logger } from '@shared/logging/logger';
import { claudeEnvironment } from './claude-environment';
import { readAgentSdkVersion, readBundledCliVersion } from './cli-version';
import type { BundledVersion } from './cli-version';

/** How long `claude --version` on `PATH` gets: a local binary printing one line. */
export const PATH_CLI_TIMEOUT_MS = 5_000;

/** How long the answer of `claude --version` is kept: the binary on `PATH` rarely moves. */
export const PATH_CLI_TTL_MS = 300_000;

/** The first `x.y.z` of what `claude --version` printed (`2.1.226 (Claude Code)`). */
export function versionInOutput(output: string): string | null {
  return /\b(\d+\.\d+\.\d+)\b/.exec(output)?.[1] ?? null;
}

/** What runs `claude --version` — injectable so a test runs no binary. */
export type VersionCommand = () => Promise<string>;

/** `claude --version`, with the machine's environment minus the backend's configuration. */
export const runPathCli: VersionCommand = () =>
  new Promise((resolve, reject) => {
    execFile(
      'claude',
      ['--version'],
      { timeout: PATH_CLI_TIMEOUT_MS, env: claudeEnvironment(process.env) },
      (error, stdout) => {
        if (error === null) resolve(String(stdout));
        else reject(error);
      },
    );
  });

const asRead = (version: BundledVersion): ReadVersion => ({
  version: version.version,
  reason: version.reason,
});

/**
 * What the installation is made of, read without a session (plan 13, B-11): the SDK, the binary it
 * spawns, the `claude` on `PATH` when there is one — the ordinary case is that the two differ —, and
 * the configuration directory the CLI reads: `CLAUDE_CONFIG_DIR`, which the boot drops when it is
 * set to nothing (plan 04, cycle 16), or `~/.claude`.
 */
export class NodeInstallationFacts implements InstallationFacts {
  readonly agentSdk = asRead(readAgentSdkVersion());
  readonly bundledCli = asRead(readBundledCliVersion());
  readonly configDir: InstallationFacts['configDir'];
  private cached: { readonly at: number; readonly answer: ReadVersion } | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly command: VersionCommand = runPathCli,
    environment: Readonly<Record<string, string | undefined>> = process.env,
    private readonly now: () => number = Date.now,
  ) {
    const configured = environment['CLAUDE_CONFIG_DIR']?.trim() ?? '';
    this.configDir =
      configured === ''
        ? { path: path.join(os.homedir(), '.claude'), fromEnvironment: false }
        : { path: configured, fromEnvironment: true };
  }

  async pathCli(): Promise<ReadVersion> {
    if (this.cached !== null && this.now() - this.cached.at < PATH_CLI_TTL_MS) {
      return this.cached.answer;
    }

    const answer = await this.ask();
    this.cached = { at: this.now(), answer };
    return answer;
  }

  private async ask(): Promise<ReadVersion> {
    try {
      const version = versionInOutput(await this.command());
      return version === null ? { version: null, reason: 'unreadable' } : { version, reason: null };
    } catch (error) {
      this.logger.debug(
        { op: 'claude.installation', layer: 'adapter', err: error },
        'no claude on PATH answered --version',
      );
      return { version: null, reason: 'notInstalled' };
    }
  }
}
