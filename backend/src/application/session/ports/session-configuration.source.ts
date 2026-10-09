import type { UserId } from '@domain/auth';
import type { EffortLevel, InstallationModel, PermissionMode } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/** Where the model a session opens with came from — said in \`session.started\` (\`defaultsFrom\`). */
export type DefaultsFrom = 'client' | 'folder' | 'user' | 'installation';

/** What a new session opens with, once its owner's defaults and the client's choice are together. */
export interface SessionConfiguration {
  readonly model: string | null;
  readonly permissionMode: PermissionMode | null;
  readonly effort: EffortLevel | null;
  readonly thinking: 'on' | 'off' | null;
  readonly outputStyle: string | null;
  readonly fallbackModel: string | null;
  readonly defaultsFrom: DefaultsFrom;
}

/** What a session asks before it opens: whose, where, and what the client already chose. */
export interface SessionConfigurationRequest {
  readonly userId: UserId;
  readonly workspace: WorkspacePath;
  readonly client: {
    readonly model: string | null;
    readonly permissionMode: PermissionMode | null;
    readonly effort: EffortLevel | null;
  };

  /** The models the session already knows for the folder, or `null` — nothing is spawned to find out. */
  readonly models: readonly InstallationModel[] | null;
}

/**
 * How a session asks the configuration of its owner before it opens (plan 13, B-15, D-03) — a port
 * the session declares, so the session never imports the module that answers it.
 */
export interface SessionConfigurationSource {
  configurationFor(request: SessionConfigurationRequest): Promise<SessionConfiguration>;
}

export const SESSION_CONFIGURATION_SOURCE = Symbol('SessionConfigurationSource');
