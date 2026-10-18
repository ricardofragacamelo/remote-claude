import { z } from 'zod';

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
