import { z } from 'zod';

import type { SkillPreferences } from '@domain/engines/claude';
import { folderField } from '../../agent-settings/agent-settings.dto';

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

/** `sources` of `PUT /engines/claude/skills/preferences` — which toggleable origins are on. */
const skillSourcesField = z
  .object({ user: z.boolean().optional(), system: z.boolean().optional() })
  .strict()
  .default({});

/** A skill's SDK-qualified name — bare for the project's own, `<plugin>:<name>` for user/system. */
const disabledSkillsField = z.array(z.string().min(1).max(320)).max(2000).default([]);

/** `PUT /engines/claude/skills/preferences`. */
export const skillPreferencesSchema = z
  .object({
    folder: folderField.nullable().default(null),
    sources: skillSourcesField,
    disabledSkills: disabledSkillsField,
  })
  .strict();

export type SkillPreferencesBody = z.infer<typeof skillPreferencesSchema>;

/** `body.sources`/`body.disabledSkills` → the domain's own shape — a key never set to `undefined`. */
export function skillPreferencesOf(body: SkillPreferencesBody): SkillPreferences {
  return {
    sources: {
      ...(body.sources.user === undefined ? {} : { user: body.sources.user }),
      ...(body.sources.system === undefined ? {} : { system: body.sources.system }),
    },
    disabledSkills: body.disabledSkills,
  };
}
