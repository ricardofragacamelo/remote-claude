import { z } from 'zod';

import { THINKING_SETTINGS } from '@domain/claude-config';
import type { ClaudeDefaults } from '@domain/claude-config';
import { EFFORT_LEVELS, PERMISSION_MODES } from '@domain/session';

/** A folder, as every route names it: absolute, in the search or the body, never as a segment. */
const folder = z.string().min(1).max(4096);

/** `?folder=`, optional. */
export const folderQuerySchema = z.object({ folder: folder.optional() });
export type FolderQueryDto = z.infer<typeof folderQuerySchema>;

/** `?folder=`, required. */
export const requiredFolderQuerySchema = z.object({ folder });

/** `GET /claude/account?refresh=` — a literal `true` or `false`, nothing else. */
export const accountQuerySchema = z.object({ refresh: z.enum(['true', 'false']).optional() });

/** `POST /claude/diagnostics/model-check`. */
export const modelCheckSchema = z.object({ model: z.string().min(1).max(256).optional() });

/**
 * The fields of a default. Every one present-or-null: a `PUT` writes the whole default, and `null`
 * is "not set here". Format only — that `bypassPermissions` is refused, and that the model exists,
 * is the domain's, with its own codes (`DEFAULT_MODE_NOT_ALLOWED`, `MODEL_NOT_AVAILABLE`).
 */
const defaultsFields = {
  model: z.string().min(1).max(256).nullable().default(null),
  permissionMode: z.enum(PERMISSION_MODES).nullable().default(null),
  effort: z.enum(EFFORT_LEVELS).nullable().default(null),
  thinking: z.enum(THINKING_SETTINGS).nullable().default(null),
  outputStyle: z.string().min(1).max(128).nullable().default(null),
  fallbackModel: z.string().min(1).max(256).nullable().default(null),
};

export const userDefaultsSchema = z.object(defaultsFields).strict();
export const folderDefaultsSchema = z.object({ folder, ...defaultsFields }).strict();

export type UserDefaultsBody = z.infer<typeof userDefaultsSchema>;
export type FolderDefaultsBody = z.infer<typeof folderDefaultsSchema>;

/** The defaults a body states, in the domain's shape. */
export function defaultsOf(
  body: UserDefaultsBody,
): ClaudeDefaults & { permissionMode: string | null } {
  return {
    model: body.model,
    permissionMode: body.permissionMode as ClaudeDefaults['permissionMode'],
    effort: body.effort,
    thinking: body.thinking,
    outputStyle: body.outputStyle,
    fallbackModel: body.fallbackModel,
  };
}
