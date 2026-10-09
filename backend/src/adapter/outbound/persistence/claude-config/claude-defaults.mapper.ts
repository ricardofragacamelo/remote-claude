import { THINKING_SETTINGS } from '@domain/claude-config';
import type { ClaudeDefaults, DefaultPermissionMode, ThinkingSetting } from '@domain/claude-config';
import { EFFORT_LEVELS, PERMISSION_MODES } from '@domain/session';
import type { EffortLevel } from '@domain/session';
import type { claudeDefaults } from '@infra/database/schema';

type Row = typeof claudeDefaults.$inferSelect;

/** A value the row holds, if it is one of the values the domain knows — otherwise "not set". */
function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A row → the defaults it sets. A value this build does not know reads as not set, never as a guess. */
export function toDefaults(row: Row): ClaudeDefaults {
  return {
    model: row.model,
    permissionMode: oneOf<DefaultPermissionMode>(
      PERMISSION_MODES.filter((mode) => mode !== 'bypassPermissions') as DefaultPermissionMode[],
      row.permissionMode,
    ),
    effort: oneOf<EffortLevel>(EFFORT_LEVELS, row.effort),
    thinking: oneOf<ThinkingSetting>(THINKING_SETTINGS, row.thinking),
    outputStyle: row.outputStyle,
    fallbackModel: row.fallbackModel,
  };
}

/** The defaults → the columns that hold them. */
export function toRow(
  values: ClaudeDefaults,
): Pick<Row, 'model' | 'permissionMode' | 'effort' | 'thinking' | 'outputStyle' | 'fallbackModel'> {
  return {
    model: values.model,
    permissionMode: values.permissionMode,
    effort: values.effort,
    thinking: values.thinking,
    outputStyle: values.outputStyle,
    fallbackModel: values.fallbackModel,
  };
}
