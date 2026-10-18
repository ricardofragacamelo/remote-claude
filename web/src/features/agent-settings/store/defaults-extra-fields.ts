import type { TFunction } from 'i18next';

import type { AppError } from '@/shared/api/errors';
import type { HelpExtra } from '@/shared/components/HelpPanel';
import { createRegistry } from '@/shared/lib/registry';
import type { Registry, RegistryEntry } from '@/shared/lib/registry';
import type { EffectiveValue } from '../types/defaults';

/** One extra field of the defaults form, as it reads and saves — a hook, so it keeps its own cache. */
export interface DefaultsExtraFieldState {
  readonly value: string | null;
  readonly effective: EffectiveValue | null;
  readonly saving: boolean;
  readonly error: AppError | null;

  /** Saves it — the form calls this itself the moment the shared "Save" is clicked (S-37). */
  save(value: string | null): void;
}

/**
 * A field the defaults form of one engine has besides the ones every engine understands — an output
 * style, say (plan 28, B-36, D-06). Registered by the engine's extension, read by the core's
 * `DefaultsForm` the same way as any other field: an `<input>`, already translated, with where the
 * value in force comes from.
 */
export interface DefaultsExtraField extends RegistryEntry {
  readonly engine: string;
  readonly labelKey: string;
  useField(folder: string | undefined): DefaultsExtraFieldState;

  /** The part of the screen's help this field adds — folded into the "Models" section's own. */
  help?(t: TFunction): HelpExtra;
}

/** The extra fields of every engine's defaults form, each read by the engine that registered it. */
export const defaultsExtraFields: Registry<DefaultsExtraField> = createRegistry(
  'agent defaults extra fields',
);
