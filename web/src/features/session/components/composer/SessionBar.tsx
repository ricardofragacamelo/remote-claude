import type { TFunction } from 'i18next';

import type { SessionSettings } from '../../hooks/useSessionSettings';
import { canDo } from '../../lib/capabilities';
import { offeredEfforts } from '../../lib/effort-levels';
import { offeredModes } from '../../lib/panel-modes';
import type { EngineCapabilities } from '../../types/engine';
import type { ComposerBarChoices } from './ComposerToolbar';
import { ContextMeter } from './ContextMeter';
import { EffortPicker, knownModel, ModelPicker, ModePicker } from './SessionChoices';

/** What the engine of the session can do, and the way to compact its conversation. */
export interface SessionEngine {
  readonly capabilities: EngineCapabilities | null;
  onCompact(): void;
}

/**
 * The choices of a live session's bar (plan 09, B-11, B-13): its mode — among the ones its engine
 * announces (plan 28, B-27) — and its model, which change the next turn; its effort, only shown — changing it would start the query again without the hook
 * that asks before each tool (08 · D-16, S-90); and how full its context window is — only for an
 * engine that says (`contextUse`), with the way to compact only for one that compacts (`compaction`,
 * plan 28, S-70, S-72).
 */
export function sessionBarOf(
  sessionId: string,
  settings: SessionSettings,
  engine: SessionEngine,
  t: TFunction,
): ComposerBarChoices {
  const model = knownModel(settings.models, settings.model);
  const choices = (sub: boolean) => (
    <>
      <ModelPicker
        sub={sub}
        models={settings.models}
        current={settings.model}
        onPick={settings.setModel}
      />
      <EffortPicker
        sub={sub}
        levels={offeredEfforts(settings.capabilities, model)}
        current={settings.effort}
        readOnly
      />
    </>
  );

  return {
    label: t('sessions.header.label'),
    mode: (
      <ModePicker
        offered={offeredModes(settings.capabilities)}
        current={settings.mode}
        onPick={settings.setMode}
      />
    ),
    choices: choices(false),
    choicesMenu: choices(true),
    meter: canDo(engine.capabilities, 'contextUse') ? (
      <ContextMeter
        sessionId={sessionId}
        onCompact={canDo(engine.capabilities, 'compaction') ? engine.onCompact : undefined}
      />
    ) : undefined,
  };
}
