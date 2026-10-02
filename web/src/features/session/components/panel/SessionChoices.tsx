import { useTranslation } from 'react-i18next';

import type { EffortLevel, PanelMode } from '../../store/claude-panel.store';
import type { InstallationModel } from '../../types/insight';
import { ChoiceMenu } from './ChoiceMenu';

/** The modes the panel offers — never `bypassPermissions`, which this product never allows (S-170). */
export const PANEL_MODES: readonly PanelMode[] = ['default', 'acceptEdits', 'plan'];

/** The words of each mode — named in full so the i18n check sees each key. */
const MODE_NAMES: Readonly<
  Record<PanelMode, { readonly label: string; readonly description: string }>
> = {
  default: { label: 'sessions.mode.default', description: 'sessions.mode.defaultDescription' },
  acceptEdits: {
    label: 'sessions.mode.acceptEdits',
    description: 'sessions.mode.acceptEditsDescription',
  },
  plan: { label: 'sessions.mode.plan', description: 'sessions.mode.planDescription' },
};

const EFFORT_NAMES: Readonly<Record<EffortLevel, string>> = {
  low: 'sessions.effort.low',
  medium: 'sessions.effort.medium',
  high: 'sessions.effort.high',
  xhigh: 'sessions.effort.xhigh',
  max: 'sessions.effort.max',
};

export interface ModelPickerProps {
  readonly models: readonly InstallationModel[];

  /** The model chosen, or `null` for the installation's default. */
  readonly current: string | null;
  readonly disabled?: boolean;
  onPick(model: string): void;
}

/**
 * The model, from the installation's own list — its names and descriptions shown as it gives them
 * (plan 08, B-36). With no list, only what is in use, or the installation's default (S-168, S-172).
 */
export function ModelPicker({
  models,
  current,
  disabled,
  onPick,
}: ModelPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const known =
    current === null
      ? undefined
      : models.find((model) => model.value === current || model.resolvedModel === current);
  const value = known?.displayName ?? current ?? t('sessions.model.default');

  return (
    <ChoiceMenu
      label={t('sessions.model.label')}
      value={value}
      current={known?.value ?? current}
      disabled={disabled === true || models.length === 0}
      options={models.map((model) => ({
        id: model.value,
        label: model.displayName,
        description: model.description,
      }))}
      onPick={onPick}
    />
  );
}

/** The mode — what each one stops asking, said in full (B-36). */
export function ModePicker({
  current,
  onPick,
}: {
  readonly current: string | null;
  onPick(mode: PanelMode): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const mode = PANEL_MODES.find((each) => each === current) ?? 'default';

  return (
    <div className="flex flex-col gap-1">
      <ChoiceMenu
        label={t('sessions.mode.label')}
        value={t(MODE_NAMES[mode].label)}
        current={mode}
        options={PANEL_MODES.map((each) => ({
          id: each,
          label: t(MODE_NAMES[each].label),
          description: t(MODE_NAMES[each].description),
        }))}
        onPick={(picked) => {
          onPick(picked as PanelMode);
        }}
      />
      {mode === 'acceptEdits' && (
        <p role="note" className="text-ui-xs text-warning">
          {t('sessions.mode.acceptEditsWarning')}
        </p>
      )}
    </div>
  );
}

/** The effort — only for a model that takes it, with its own levels (D-16, S-171). */
export function EffortPicker({
  model,
  current,
  onPick,
}: {
  readonly model: InstallationModel | undefined;
  readonly current: EffortLevel | null;
  onPick(effort: EffortLevel | null): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (model?.supportsEffort !== true) {
    return null;
  }

  return (
    <ChoiceMenu
      label={t('sessions.effort.label')}
      value={current === null ? t('sessions.effort.default') : t(EFFORT_NAMES[current])}
      current={current}
      options={[
        { id: 'default', label: t('sessions.effort.default') },
        ...model.supportedEffortLevels.map((level) => ({
          id: level,
          label: t(EFFORT_NAMES[level]),
        })),
      ]}
      onPick={(picked) => {
        onPick(picked === 'default' ? null : (picked as EffortLevel));
      }}
    />
  );
}
