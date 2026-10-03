import type { TFunction } from 'i18next';

import type { SessionSettings } from '../../hooks/useSessionSettings';
import type { ComposerBarChoices } from './ComposerToolbar';
import { ContextMeter } from './ContextMeter';
import { EffortPicker, knownModel, ModelPicker, ModePicker } from './SessionChoices';

/**
 * The choices of a live session's bar (plan 09, B-11, B-13): its mode and its model, which change
 * the next turn; its effort, only shown — changing it would start the query again without the hook
 * that asks before each tool (08 · D-16, S-90); and how full its context window is.
 */
export function sessionBarOf(
  sessionId: string,
  settings: SessionSettings,
  onCompact: () => void,
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
      <EffortPicker sub={sub} model={model} current={settings.effort} readOnly />
    </>
  );

  return {
    label: t('sessions.header.label'),
    mode: <ModePicker current={settings.mode} onPick={settings.setMode} />,
    choices: choices(false),
    choicesMenu: choices(true),
    meter: <ContextMeter sessionId={sessionId} onCompact={onCompact} />,
  };
}
