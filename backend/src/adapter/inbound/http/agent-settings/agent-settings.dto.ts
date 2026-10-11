import { z } from 'zod';

import { THINKING_SETTINGS } from '@domain/agent-settings';
import type { AgentDefaults } from '@domain/agent-settings';
import { PERMISSION_MODES } from '@domain/engine';
import { EFFORT_LEVELS } from '@domain/session';

/** A folder, as every route names it: absolute, in the search or the body, never as a segment. */
export const folderField = z.string().min(1).max(4096);

/** `?folder=`, optional. */
export const folderQuerySchema = z.object({ folder: folderField.optional() });
export type FolderQueryDto = z.infer<typeof folderQuerySchema>;

/** `?folder=`, required. */
export const requiredFolderQuerySchema = z.object({ folder: folderField });

/** `:engine`, in the form of an engine's name — whether one is enabled is the use case's to say. */
export const engineParamSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/**
 * The fields of a default every engine understands. Every one present-or-null: a `PUT` writes the
 * whole default, and `null` is "not set here". Format only — that the model exists is the domain's,
 * with its own code (`MODEL_NOT_AVAILABLE`).
 */
export const defaultsFields = {
  model: z.string().min(1).max(256).nullable().default(null),
  permissionMode: z.enum(PERMISSION_MODES).nullable().default(null),
  effort: z.enum(EFFORT_LEVELS).nullable().default(null),
  thinking: z.enum(THINKING_SETTINGS).nullable().default(null),
  fallbackModel: z.string().min(1).max(256).nullable().default(null),
};

export const userDefaultsSchema = z.object(defaultsFields).strict();
export const folderDefaultsSchema = z.object({ folder: folderField, ...defaultsFields }).strict();

export type UserDefaultsBody = z.infer<typeof userDefaultsSchema>;
export type FolderDefaultsBody = z.infer<typeof folderDefaultsSchema>;

/** The defaults a body states, in the domain's shape. */
export function defaultsOf(body: UserDefaultsBody): AgentDefaults {
  return {
    model: body.model,
    permissionMode: body.permissionMode,
    effort: body.effort,
    thinking: body.thinking,
    fallbackModel: body.fallbackModel,
  };
}
