import type { EffortLevel, InstallationModel } from '@/features/session';

export type { EffortLevel };

/** The levels of effort a model can declare, in the order a list shows them. */
export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The modes a default can take — `bypassPermissions` never is one (plan 13, B-14). */
export const DEFAULT_MODES = ['default', 'acceptEdits', 'plan', 'allowAll'] as const;
export type DefaultMode = (typeof DEFAULT_MODES)[number];

export const THINKING_SETTINGS = ['on', 'off'] as const;
export type ThinkingSetting = (typeof THINKING_SETTINGS)[number];

/** A model the installation offers — the same the panel of a session switches among (S-56). */
export type ClaudeModel = InstallationModel;

/** What each field of a default holds when it is set. */
interface FieldValues {
  readonly model: string;
  readonly permissionMode: DefaultMode;
  readonly effort: EffortLevel;
  readonly thinking: ThinkingSetting;
  readonly outputStyle: string;
  readonly fallbackModel: string;
}

/** The fields of a default, in the order the form lists them. */
export const DEFAULT_FIELDS = [
  'model',
  'permissionMode',
  'effort',
  'thinking',
  'outputStyle',
  'fallbackModel',
] as const satisfies readonly (keyof FieldValues)[];
export type DefaultField = (typeof DEFAULT_FIELDS)[number];

/** What a default sets; `null` is "not set here". */
export type ClaudeDefaults = { readonly [K in DefaultField]: FieldValues[K] | null };

/** Nothing set — every field left to the next layer down. */
export const NO_DEFAULTS = Object.fromEntries(
  DEFAULT_FIELDS.map((field) => [field, null]),
) as ClaudeDefaults;

/** Where an effective value came from. */
export type DefaultsOrigin = 'folder' | 'user' | 'installation';

export interface EffectiveValue {
  readonly value: string | null;
  readonly from: DefaultsOrigin;
  readonly folder?: string;
}

/** The defaults as the screen shows them. */
export interface DefaultsView {
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>>;
  readonly user: ClaudeDefaults;
  readonly folder: { readonly folder: string; readonly values: ClaudeDefaults } | null;
}
