import { THINKING_SETTINGS } from '@domain/agent-settings';
import type { AgentDefaults, ThinkingSetting } from '@domain/agent-settings';
import { PERMISSION_MODES } from '@domain/engine';
import type { PermissionMode } from '@domain/engine';
import { EFFORT_LEVELS } from '@domain/session';
import type { EffortLevel } from '@domain/session';
import type { agentDefaults } from '@infra/database/schema';

type Row = typeof agentDefaults.$inferSelect;

/** A value the row holds, if it is one of the values the domain knows — otherwise "not set". */
function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A row → the defaults it sets. A value this build does not know reads as not set, never as a guess. */
export function toDefaults(row: Row): AgentDefaults {
  return {
    model: row.model,
    permissionMode: oneOf<PermissionMode>(PERMISSION_MODES, row.permissionMode),
    effort: oneOf<EffortLevel>(EFFORT_LEVELS, row.effort),
    thinking: oneOf<ThinkingSetting>(THINKING_SETTINGS, row.thinking),
    fallbackModel: row.fallbackModel,
  };
}

/** The defaults → the columns that hold them. */
export function toRow(
  values: AgentDefaults,
): Pick<Row, 'model' | 'permissionMode' | 'effort' | 'thinking' | 'fallbackModel'> {
  return {
    model: values.model,
    permissionMode: values.permissionMode,
    effort: values.effort,
    thinking: values.thinking,
    fallbackModel: values.fallbackModel,
  };
}
