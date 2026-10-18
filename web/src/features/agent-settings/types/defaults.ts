import type {
  AgentDefaults as ContractAgentDefaults,
  DefaultsViewPayloadFolder,
} from '@remote-claude/contracts';

import type { EffortLevel, InstallationModel, PanelMode } from '@/features/session';

export type { EffortLevel };

/**
 * A mode a default can take — a canonical one; which of them the form offers is what the engine
 * announces (plan 28, B-27).
 */
export type DefaultMode = PanelMode;

export const THINKING_SETTINGS = ['on', 'off'] as const;
export type ThinkingSetting = (typeof THINKING_SETTINGS)[number];

/** A model the installation offers — the same the panel of a session switches among (S-56). */
export type AgentModel = InstallationModel;

/**
 * What every engine's defaults understand (plan 28, B-36, D-06): the model, the mode, the effort,
 * the thinking and the fallback model. What only one engine has — a style of its answers, say — is
 * that engine's own field, contributed into the form by its extension (`defaultsExtraFields`), never
 * one of these.
 */
interface FieldValues {
  readonly model: string;
  readonly permissionMode: DefaultMode;
  readonly effort: EffortLevel;
  readonly thinking: ThinkingSetting;
  readonly fallbackModel: string;
}

/** The fields of a default, in the order the form lists them. */
export const DEFAULT_FIELDS = [
  'model',
  'permissionMode',
  'effort',
  'thinking',
  'fallbackModel',
] as const satisfies readonly (keyof FieldValues)[];
export type DefaultField = (typeof DEFAULT_FIELDS)[number];

/**
 * What a default sets; `null` is "not set here" (`GET/PUT /engines/:engine/defaults` and friends).
 */
export type AgentDefaults = ContractAgentDefaults;

/** Nothing set — every field left to the next layer down. */
export const NO_DEFAULTS = Object.fromEntries(
  DEFAULT_FIELDS.map((field) => [field, null]),
) as unknown as AgentDefaults;

/** Where an effective value came from. */
export type DefaultsOrigin = 'folder' | 'user' | 'installation';

export interface EffectiveValue {
  readonly value: string | null;
  readonly from: DefaultsOrigin;
  readonly folder?: string;
}

/**
 * The defaults as the screen shows them (`GET/PUT /engines/:engine/defaults` and friends).
 *
 * `effective` is this feature's own, homogeneous read of the contract's `DefaultsViewPayload`:
 * the wire answers with five independent properties, one per field, each typed to that field's own
 * value — `EffectiveValue<T>` is generic in TypeScript, and JSON Schema has no generics (plan 28,
 * B-48) — widened back here into one shape every field shares, which is what lets the form iterate
 * `DEFAULT_FIELDS` instead of reading each one by name.
 */
export interface DefaultsView {
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>>;
  readonly user: AgentDefaults;
  readonly folder: DefaultsViewPayloadFolder | null;
}
