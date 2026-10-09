import type { EffortLevel, PermissionMode } from '@domain/session';

/** What the thinking of a session is set to, when a default sets it. */
export const THINKING_SETTINGS = ['on', 'off'] as const;

export type ThinkingSetting = (typeof THINKING_SETTINGS)[number];

/**
 * The modes a default may take: every mode of ours but `bypassPermissions`, which switches the
 * approval off and so is never something a session starts with unasked (plan 13, B-14).
 */
export type DefaultPermissionMode = Exclude<PermissionMode, 'bypassPermissions'>;

/**
 * What a default sets — for the user, or for a folder and its subfolders (plan 13, D-04, D-06).
 *
 * Every field `null` is "not set here": the next layer down decides, and at the bottom the
 * installation's own default.
 */
export interface ClaudeDefaults {
  readonly model: string | null;
  readonly permissionMode: DefaultPermissionMode | null;
  readonly effort: EffortLevel | null;
  readonly thinking: ThinkingSetting | null;
  readonly outputStyle: string | null;
  readonly fallbackModel: string | null;
}

/** The fields of a default, in the order a screen lists them. */
export const DEFAULT_FIELDS = [
  'model',
  'permissionMode',
  'effort',
  'thinking',
  'outputStyle',
  'fallbackModel',
] as const satisfies readonly (keyof ClaudeDefaults)[];

export type DefaultField = (typeof DEFAULT_FIELDS)[number];

/** Nothing set — what a user who never chose anything has. */
export const NO_DEFAULTS: ClaudeDefaults = {
  model: null,
  permissionMode: null,
  effort: null,
  thinking: null,
  outputStyle: null,
  fallbackModel: null,
};

/** The override of one folder: it applies to the folder and to everything under it. */
export interface FolderDefaults {
  readonly folder: string;
  readonly values: ClaudeDefaults;
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
  readonly [K in DefaultField]: EffectiveValue<ClaudeDefaults[K]>;
};

/** Whether two defaults set the same thing — what decides that saving changed nothing. */
export function sameDefaults(left: ClaudeDefaults, right: ClaudeDefaults): boolean {
  return DEFAULT_FIELDS.every((field) => left[field] === right[field]);
}
