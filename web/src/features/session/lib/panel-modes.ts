import type { PanelMode } from '../store/agent-panel.store';
import type { EngineCapabilities } from '../types/engine';

/**
 * How a mode this browser kept reads now — the one translation of a value written by an older build
 * (plan 28, B-27, S-82): the canonical names as they are, the names of the protocol before them
 * (`default`, `plan`) as the canonical ones they became, and anything else as nothing.
 */
const KEPT_MODES: ReadonlyMap<string, PanelMode> = new Map<string, PanelMode>([
  ['ask', 'ask'],
  ['acceptEdits', 'acceptEdits'],
  ['readOnly', 'readOnly'],
  ['allowAll', 'allowAll'],
  ['default', 'ask'],
  ['plan', 'readOnly'],
]);

/** The mode a kept value names, read once through the translation — `null` for one it does not. */
export function keptMode(value: unknown): PanelMode | null {
  return typeof value === 'string' ? (KEPT_MODES.get(value) ?? null) : null;
}

/**
 * The modes a conversation offers: exactly what its engine announces, in its order — none while the
 * capabilities are not known (plan 28, B-27, S-81).
 */
export function offeredModes(capabilities: EngineCapabilities | null): readonly PanelMode[] {
  return capabilities?.permissionModes ?? [];
}

/**
 * The mode a picker shows and a draft starts with: `current` when the engine offers it, its first
 * mode when it does not — a draft kept with a mode another engine had — and `null` with none known.
 */
export function shownMode(offered: readonly PanelMode[], current: string | null): PanelMode | null {
  return offered.find((each) => each === current) ?? offered[0] ?? null;
}

/**
 * The mode after `current`, in the order the engine announces them, and from the last the first
 * again — what "Switch the mode" moves to (plan 09, D-09). `null` when there is nowhere to move.
 *
 * Permitir tudo is never a next: a shortcut cycling modes must not switch every question off by
 * accident, so it is only chosen from the menu, with its warning in sight. From it, the shortcut
 * goes back to the first mode (plan 23, D-10).
 */
export function nextPanelMode(
  offered: readonly PanelMode[],
  current: string | null,
): PanelMode | null {
  const cycle = offered.filter((each) => each !== 'allowAll');
  const next = cycle[(cycle.findIndex((each) => each === current) + 1) % cycle.length];

  return next === undefined || next === current ? null : next;
}
