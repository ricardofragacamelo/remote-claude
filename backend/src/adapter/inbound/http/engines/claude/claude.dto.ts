import { z } from 'zod';

import { PERMISSION_MODES } from '@domain/engine';
import type { LegacyDefaults } from '@application/engines/claude';
import {
  defaultsFields,
  folderField,
} from '../../agent-settings/agent-settings.dto';

/** `GET /engines/claude/account?refresh=` — a literal `true` or `false`, nothing else. */
export const accountQuerySchema = z.object({ refresh: z.enum(['true', 'false']).optional() });

/** `POST /engines/claude/diagnostics/model-check`. */
export const modelCheckSchema = z.object({ model: z.string().min(1).max(256).optional() });

/** An output style, as Claude names one — or `null`, "not set here". */
const outputStyle = z.string().min(1).max(128).nullable().default(null);

/** `PUT /engines/claude/output-style`. */
export const userOutputStyleSchema = z.object({ outputStyle }).strict();

/** `PUT /engines/claude/output-style/folder`. */
export const folderOutputStyleSchema = z.object({ folder: folderField, outputStyle }).strict();

/**
 * The fields of a default as `/claude/defaults` took them before the split (plan 28, D-07, `v-1`):
 * the core's, the output style, and the mode that skips asking — refused by the domain with its
 * own code (`DEFAULT_MODE_NOT_ALLOWED`), as before.
 */
const legacyFields = {
  ...defaultsFields,
  permissionMode: z
    .enum([...PERMISSION_MODES, 'bypassPermissions'])
    .nullable()
    .default(null),
  outputStyle,
};

export const legacyUserDefaultsSchema = z.object(legacyFields).strict();
export const legacyFolderDefaultsSchema = z.object({ folder: folderField, ...legacyFields }).strict();

export type LegacyUserDefaultsBody = z.infer<typeof legacyUserDefaultsSchema>;
export type LegacyFolderDefaultsBody = z.infer<typeof legacyFolderDefaultsSchema>;

/** The defaults a body of the first protocol states. */
export function legacyDefaultsOf(body: LegacyUserDefaultsBody): LegacyDefaults {
  return {
    model: body.model,
    permissionMode: body.permissionMode,
    effort: body.effort,
    thinking: body.thinking,
    fallbackModel: body.fallbackModel,
    outputStyle: body.outputStyle,
  };
}
