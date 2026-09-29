import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { ConfigurationError } from '@remote-claude/config';
import type { Logger } from '@shared/logging/logger';
import type { ReloadableWorkspaceAllowlist } from './reloadable-workspace-allowlist';

/** The signal that reloads the allowlist. */
export const RELOAD_SIGNAL = 'SIGHUP';

/** Where the signal arrives — the process, or a stand-in a test can emit on. */
export interface SignalSource {
  on(signal: typeof RELOAD_SIGNAL, listener: () => void): unknown;
  removeListener(signal: typeof RELOAD_SIGNAL, listener: () => void): unknown;
}

/**
 * `SIGHUP` reloads the allowlist — the explicit trigger the reload never had (06 · D-15).
 *
 * Explicit, and never a watch of the file: saving it changes nothing until the operator says so,
 * because an allowlist that moves on its own moves the security boundary without anybody deciding
 * to. `pnpm allowlist add|remove` sends the signal; so can anybody with a shell on the machine,
 * which is exactly who may change the list.
 *
 * With this listener registered the signal does **not** end the process — without one, Node treats
 * `SIGHUP` as a termination, and so does Nest's shutdown hook unless it is told otherwise
 * (`SHUTDOWN_SIGNALS` in bootstrap.ts). Only the list in memory changes: connections and live
 * sessions are left alone, and the list applies to what opens next (plan 06, S-64, S-180).
 *
 * A reload that fails keeps the previous list and says why, at `error`: the process stays up with
 * the boundary it had, which beats both going down and going on with nothing.
 */
export class AllowlistReloadSignal implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly listener = (): void => {
    this.reload();
  };

  constructor(
    private readonly allowlist: ReloadableWorkspaceAllowlist,
    private readonly logger: Logger,
    private readonly signals: SignalSource = process,
  ) {}

  onApplicationBootstrap(): void {
    this.signals.on(RELOAD_SIGNAL, this.listener);
  }

  onApplicationShutdown(): void {
    this.signals.removeListener(RELOAD_SIGNAL, this.listener);
  }

  /** One reload, as the signal triggers it. Logs its outcome; never throws. */
  reload(): void {
    const context = {
      op: 'allowlist.reloaded',
      layer: 'infrastructure',
      module: 'workspace',
      file: this.allowlist.file,
    };

    try {
      const change = this.allowlist.reload();

      this.logger.info(
        { ...context, added: change.added, removed: change.removed },
        'workspace allowlist reloaded',
      );
    } catch (error) {
      this.logger.error(
        {
          ...context,
          problems: error instanceof ConfigurationError ? error.problems : undefined,
          err: error,
        },
        'workspace allowlist reload failed; the previous list stays in use',
      );
    }
  }
}
