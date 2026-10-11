import type { EffortLevel, PermissionMode } from '@domain/session';

/** What the thinking of a session is set to, when a default sets it. */
export const THINKING_SETTINGS = ['on', 'off'] as const;

export type ThinkingSetting = (typeof THINKING_SETTINGS)[number];

/**
 * What a default sets for the sessions of one engine — for the user, or for a folder and its
 * subfolders (plan 13, D-04, D-06; plan 28, D-06).
 *
 * The fields every coding agent understands: the model, the mode, the effort, the thinking and the
 * fallback model. What only one engine has (a style of its answers, say) is that engine's extension
 * and is kept by it. Every field `null` is "not set here": the next layer down decides, and at the
 * bottom the installation's own default.
 */
export interface AgentDefaults {
  readonly model: string | null;
  readonly permissionMode: PermissionMode | null;
  readonly effort: EffortLevel | null;
  readonly thinking: ThinkingSetting | null;
  readonly fallbackModel: string | null;
}

/** The fields of a default, in the order a screen lists them. */
export const DEFAULT_FIELDS = [
  'model',
  'permissionMode',
  'effort',
  'thinking',
  'fallbackModel',
] as const satisfies readonly (keyof AgentDefaults)[];

export type DefaultField = (typeof DEFAULT_FIELDS)[number];

/** Nothing set — what a user who never chose anything has. */
export const NO_DEFAULTS: AgentDefaults = {
  model: null,
  permissionMode: null,
  effort: null,
  thinking: null,
  fallbackModel: null,
};

/** The override of one folder: it applies to the folder and to everything under it. */
export interface FolderDefaults {
  readonly folder: string;
  readonly values: AgentDefaults;
}

/**
 * Where an effective value came from: the nearest folder override, the user's default, or — when
 * neither sets it — the installation.
 */
export type DefaultsOrigin = 'folder' | 'user' | 'installation';

/** One field as it applies in a folder, and why. */
export interface EffectiveValue<T> {
  readonly value: T | null;
  readonly from: DefaultsOrigin;

  /** The folder whose override set it, when `from` is `folder`. */
  readonly folder?: string;
}

/** Every field as it applies in a folder. */
export type EffectiveDefaults = {
  readonly [K in DefaultField]: EffectiveValue<AgentDefaults[K]>;
};

/** Whether two defaults set the same thing — what decides that saving changed nothing. */
export function sameDefaults(left: AgentDefaults, right: AgentDefaults): boolean {
  return DEFAULT_FIELDS.every((field) => left[field] === right[field]);
}
