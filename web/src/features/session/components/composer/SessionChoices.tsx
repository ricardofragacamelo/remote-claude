import { Brain, Cpu, ShieldCheck, ShieldAlert, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { PANEL_MODES, panelModeOf } from '../../lib/panel-modes';
import type { EffortLevel, PanelMode } from '../../store/claude-panel.store';
import type { InstallationModel } from '../../types/insight';
import { ChoiceMenu } from './ChoiceMenu';

/** The words and the icon of each mode — named in full so the i18n check sees each key. */
const MODE_NAMES: Readonly<
  Record<
    PanelMode,
    { readonly label: string; readonly description: string; readonly icon: LucideIcon }
  >
> = {
  default: {
    label: 'sessions.mode.default',
    description: 'sessions.mode.defaultDescription',
    icon: ShieldCheck,
  },
  acceptEdits: {
    label: 'sessions.mode.acceptEdits',
    description: 'sessions.mode.acceptEditsDescription',
    icon: ShieldAlert,
  },
  plan: {
    label: 'sessions.mode.plan',
    description: 'sessions.mode.planDescription',
    icon: ClipboardList,
  },
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

  /** In the overflow menu of a narrow bar. */
  readonly sub?: boolean;
  onPick(model: string): void;
}

/** The model of the installation a value names — by its alias or by the model it resolves to. */
export function knownModel(
  models: readonly InstallationModel[],
  current: string | null,
): InstallationModel | undefined {
  return current === null
    ? undefined
    : models.find((model) => model.value === current || model.resolvedModel === current);
}

/**
 * The model, from the installation's own list — its names and descriptions shown as it gives them
 * (plan 08, B-36). With no list, only what is in use, or the installation's default (S-168, S-172).
 */
export function ModelPicker({
  models,
  current,
  disabled,
  sub,
  onPick,
}: ModelPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const known = knownModel(models, current);
  const value = known?.displayName ?? current ?? t('sessions.model.default');

  return (
    <ChoiceMenu
      label={t('sessions.model.label')}
      value={value}
      icon={Cpu}
      sub={sub}
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

/**
 * The mode — what each one stops asking, said in full (B-36). Accepting edits puts the chip in the
 * tone of a warning, and says why inside the menu, never as a loose line (plan 09, S-24).
 */
export function ModePicker({
  current,
  onPick,
}: {
  readonly current: string | null;
  onPick(mode: PanelMode): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const mode = panelModeOf(current);
  const accepting = mode === 'acceptEdits';

  return (
    <ChoiceMenu
      label={t('sessions.mode.label')}
      value={t(MODE_NAMES[mode].label)}
      icon={MODE_NAMES[mode].icon}
      warning={accepting}
      note={accepting ? t('sessions.mode.acceptEditsWarning') : undefined}
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
  );
}

export interface EffortPickerProps {
  readonly model: InstallationModel | undefined;

  /** `null` for the model's default; `undefined` when it is not known — a session opened elsewhere. */
  readonly current: EffortLevel | null | undefined;

  /**
   * A live session: the effort is only shown. Changing it would start the query again, without the
   * hook that asks before each tool (plan 08, D-16) — the chip says so (plan 09, S-90).
   */
  readonly readOnly?: boolean;

  /** In the overflow menu of a narrow bar. */
  readonly sub?: boolean;

  /** What a choice does — none for one that is only shown. */
  readonly onPick?: ((effort: EffortLevel | null) => void) | undefined;
}

/** The effort — only for a model that takes it, with its own levels (D-16, S-171). */
export function EffortPicker({
  model,
  current,
  readOnly = false,
  sub,
  onPick,
}: EffortPickerProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (model?.supportsEffort !== true) {
    return null;
  }

  return (
    <ChoiceMenu
      label={t('sessions.effort.label')}
      value={effortName(current, t)}
      icon={Brain}
      sub={sub}
      readOnly={readOnly ? t('sessions.effort.readOnly') : undefined}
      current={current ?? null}
      options={[
        { id: 'default', label: t('sessions.effort.default') },
        ...model.supportedEffortLevels.map((level) => ({
          id: level,
          label: t(EFFORT_NAMES[level]),
        })),
      ]}
      onPick={(picked) => {
        onPick?.(picked === 'default' ? null : (picked as EffortLevel));
      }}
    />
  );
}

/** What an effort is called — the model's default, or not known. */
function effortName(current: EffortLevel | null | undefined, t: TFunction): string {
  if (current === undefined) {
    return t('sessions.effort.unknown');
  }

  return current === null ? t('sessions.effort.default') : t(EFFORT_NAMES[current]);
}
