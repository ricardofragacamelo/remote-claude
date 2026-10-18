import { Bot, Brain, Cpu, Eye, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { levelName } from '../../lib/effort-levels';
import { shownMode } from '../../lib/panel-modes';
import type { EffortLevel, PanelMode } from '../../store/agent-panel.store';
import type { EngineDirectory } from '../../types/engine';
import type { InstallationModel } from '../../types/insight';
import { ChoiceMenu } from './ChoiceMenu';

/** The words and the icon of each mode — named in full so the i18n check sees each key. */
const MODE_NAMES: Readonly<
  Record<
    PanelMode,
    { readonly label: string; readonly description: string; readonly icon: LucideIcon }
  >
> = {
  ask: {
    label: 'sessions.mode.ask',
    description: 'sessions.mode.askDescription',
    icon: ShieldCheck,
  },
  acceptEdits: {
    label: 'sessions.mode.acceptEdits',
    description: 'sessions.mode.acceptEditsDescription',
    icon: ShieldAlert,
  },
  readOnly: {
    label: 'sessions.mode.readOnly',
    description: 'sessions.mode.readOnlyDescription',
    icon: Eye,
  },
  allowAll: {
    label: 'sessions.mode.allowAll',
    description: 'sessions.mode.allowAllDescription',
    icon: ShieldOff,
  },
};

/** What the open menu says before the modes, for the two that stop asking. */
const MODE_WARNINGS: Readonly<Partial<Record<PanelMode, string>>> = {
  acceptEdits: 'sessions.mode.acceptEditsWarning',
  allowAll: 'sessions.mode.allowAllWarning',
};

/** The name of each canonical level — named in full so the i18n check sees each key. */
const EFFORT_NAMES: ReadonlyMap<string, string> = new Map<EffortLevel, string>([
  ['low', 'sessions.effort.low'],
  ['medium', 'sessions.effort.medium'],
  ['high', 'sessions.effort.high'],
  ['xhigh', 'sessions.effort.xhigh'],
  ['max', 'sessions.effort.max'],
]);

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

export interface EnginePickerProps {
  /** The engines of the installation, as `GET /engines` lists them — `null` before it answers. */
  readonly directory: EngineDirectory | null;

  /** The engine chosen, or `null` for the installation's default. */
  readonly current: string | null;

  /** In the overflow menu of a narrow bar. */
  readonly sub?: boolean;
  onPick(engine: string | null): void;
}

/** The sentinel {@link ChoiceMenu} is given for "the installation's default", never an id of one. */
const DEFAULT_ENGINE_OPTION = 'default';

/**
 * The engine a draft opens on (plan 28, B-44) — one of the agents this installation drives,
 * `GET /engines` says can open a session now. With fewer than two of those there is nothing to
 * choose, and no chip at all (S-124): a second engine unavailable (not installed, its security
 * assertion unmet) is never offered, the same way it never opens a session when named by hand.
 */
export function EnginePicker({
  directory,
  current,
  sub,
  onPick,
}: EnginePickerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const available = (directory?.engines ?? []).filter((engine) => engine.state === 'available');

  if (available.length < 2) {
    return null;
  }

  const chosen = available.find((engine) => engine.id === current);
  const value = current === null ? t('sessions.engine.default') : (chosen?.displayName ?? current);

  return (
    <ChoiceMenu
      label={t('sessions.engine.label')}
      value={value}
      icon={Bot}
      sub={sub}
      current={current ?? DEFAULT_ENGINE_OPTION}
      options={[
        { id: DEFAULT_ENGINE_OPTION, label: t('sessions.engine.default') },
        ...available.map((engine) => ({ id: engine.id, label: engine.displayName })),
      ]}
      onPick={(picked) => {
        onPick(picked === DEFAULT_ENGINE_OPTION ? null : picked);
      }}
    />
  );
}

/**
 * The mode — what each one stops asking, said in full (B-36). Accepting edits puts the chip in the
 * tone of a warning, and Permitir tudo in the tone of danger — each with its icon and its name, never
 * colour alone — and says why inside the menu, never as a loose line (plan 09, S-24; plan 23, S-71).
 *
 * The modes are exactly the ones the engine announces, in its order: with one, or none known, there
 * is nothing to choose and no chip (plan 28, B-27, S-81).
 */
export function ModePicker({
  offered,
  current,
  onPick,
}: {
  readonly offered: readonly PanelMode[];
  readonly current: string | null;
  onPick(mode: PanelMode): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const mode = shownMode(offered, current);

  if (mode === null || offered.length < 2) {
    return null;
  }

  const warning = MODE_WARNINGS[mode];

  return (
    <ChoiceMenu
      label={t('sessions.mode.label')}
      value={t(MODE_NAMES[mode].label)}
      icon={MODE_NAMES[mode].icon}
      warning={mode === 'acceptEdits'}
      danger={mode === 'allowAll'}
      note={warning === undefined ? undefined : t(warning)}
      current={mode}
      options={offered.map((each) => ({
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
  /** The levels offered — the engine's that the model takes too (plan 28, B-28). */
  readonly levels: readonly string[];

  /** `null` for the model's default; `undefined` when it is not known — a session opened elsewhere. */
  readonly current: string | null | undefined;

  /**
   * A live session: the effort is only shown. Changing it would start the query again, without the
   * hook that asks before each tool (plan 08, D-16) — the chip says so (plan 09, S-90).
   */
  readonly readOnly?: boolean;

  /** In the overflow menu of a narrow bar. */
  readonly sub?: boolean;

  /** What a choice does — none for one that is only shown. */
  readonly onPick?: ((effort: string | null) => void) | undefined;
}

/**
 * The effort — only with levels to offer: a model that takes none (D-16, S-171), or an engine that
 * announces none, has no chip at all (plan 28, S-83).
 */
export function EffortPicker({
  levels,
  current,
  readOnly = false,
  sub,
  onPick,
}: EffortPickerProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (levels.length === 0) {
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
        ...levels.map((level) => ({ id: level, label: levelName(EFFORT_NAMES, level, t) })),
      ]}
      onPick={(picked) => {
        onPick?.(picked === 'default' ? null : picked);
      }}
    />
  );
}

/** What an effort is called — the model's default, or not known. */
function effortName(current: string | null | undefined, t: TFunction): string {
  if (current === undefined) {
    return t('sessions.effort.unknown');
  }

  return current === null ? t('sessions.effort.default') : levelName(EFFORT_NAMES, current, t);
}
