import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import { levelName, useEngineCapabilities } from '@/features/session';
import type { DefaultsExtraField } from '../store/defaults-extra-fields';
import { THINKING_SETTINGS } from '../types/defaults';
import type {
  AgentDefaults,
  AgentModel,
  DefaultField,
  DefaultMode,
  DefaultsOrigin,
  EffectiveValue,
  EffortLevel,
} from '../types/defaults';

const INPUT = 'h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8';

/** The label and the help of each field, named in full. */
const FIELD_KEYS: Readonly<
  Record<DefaultField, { readonly label: string; readonly help: string }>
> = {
  model: { label: 'agentSettings.models.model', help: 'model' },
  permissionMode: { label: 'agentSettings.models.permissionMode', help: 'modes' },
  effort: { label: 'agentSettings.models.effort', help: 'effort' },
  thinking: { label: 'agentSettings.models.thinking', help: 'thinking' },
  fallbackModel: { label: 'agentSettings.models.fallbackModel', help: 'model' },
};

/** Each mode, named in full. */
const MODE_NAMES: Readonly<Record<DefaultMode, string>> = {
  ask: 'agentSettings.models.modeAsk',
  acceptEdits: 'agentSettings.models.modeAcceptEdits',
  readOnly: 'agentSettings.models.modeReadOnly',
  allowAll: 'agentSettings.models.modeAllowAll',
};

/** Each canonical level, named in full — one this build does not know is shown as the engine says. */
const EFFORT_NAMES: ReadonlyMap<string, string> = new Map<EffortLevel, string>([
  ['low', 'agentSettings.models.effortLow'],
  ['medium', 'agentSettings.models.effortMedium'],
  ['high', 'agentSettings.models.effortHigh'],
  ['xhigh', 'agentSettings.models.effortXhigh'],
  ['max', 'agentSettings.models.effortMax'],
]);

const THINKING_NAMES: Readonly<Record<(typeof THINKING_SETTINGS)[number], string>> = {
  on: 'agentSettings.models.thinkingOn',
  off: 'agentSettings.models.thinkingOff',
};

/** Where an effective value came from, named in full. */
const ORIGIN_NAMES: Readonly<Record<DefaultsOrigin, string>> = {
  folder: 'agentSettings.models.fromFolder',
  user: 'agentSettings.models.fromUser',
  installation: 'agentSettings.models.fromInstallation',
};

/** No field registered this slot: a hook that reads and saves nothing, so the call site never
 * becomes conditional — the form always asks for it, whether or not the engine has one (S-110). */
const NO_EXTRA_FIELD: DefaultsExtraField = {
  id: '',
  position: 0,
  engine: '',
  labelKey: '',
  useField: () => ({ value: null, effective: null, saving: false, error: null, save: () => {} }),
};

export interface DefaultsFormProps {
  /** `user` or `folder` — the scope the form writes, said in its heading. */
  readonly heading: string;
  readonly values: AgentDefaults;

  /** What applies here now, and from where — shown under each field. */
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>> | null;
  readonly models: readonly AgentModel[];
  readonly saving: boolean;
  readonly error: ErrorStateProps['error'] | null;

  /** The folder this form is about — passed to the extra field's own hook, when there is one. */
  readonly folder: string | undefined;

  /** The one field the active engine's extension adds besides the ones every engine has (D-06). */
  readonly extra?: DefaultsExtraField;
  onSave(values: AgentDefaults): void;
  onClear?(): void;
}

/** What the extra field slot of the form needs, whether or not the engine's extension has one. */
interface ExtraFieldSlot {
  readonly node: React.ReactNode;
  readonly saving: boolean;
  readonly error: ErrorStateProps['error'] | null;

  /** Saves the field's own draft — called the moment the shared "Save" is clicked. */
  submit(): void;

  /** Clears it — called alongside the core's own "Clear the folder's override". */
  clear(): void;
}

/**
 * The one field the active engine's extension adds to the form besides the core's own (D-06): read
 * on its own, behind the core's, and saved alongside it the moment the shared "Save" is clicked —
 * never a form, nor a save button, of its own. A read that answers after the field was first drawn
 * seeds the draft the one time it does; once the person edits it, their draft wins.
 */
function useExtraField(
  extra: DefaultsExtraField | undefined,
  folder: string | undefined,
): ExtraFieldSlot {
  const state = (extra ?? NO_EXTRA_FIELD).useField(folder);
  const [edited, setEdited] = useState<string | null | undefined>(undefined);
  const draft = edited === undefined ? state.value : edited;

  return {
    node:
      extra === undefined ? null : (
        <ExtraField
          labelKey={extra.labelKey}
          value={draft}
          effective={state.effective}
          onChange={setEdited}
        />
      ),
    saving: state.saving,
    error: state.error,
    submit: () => {
      if (extra !== undefined) {
        state.save(draft);
      }
    },
    clear: () => {
      if (extra !== undefined) {
        state.save(null);
      }
    },
  };
}

/**
 * The levels of effort a model takes, of the ones the engine announces — every one of them for a
 * model the installation did not list, none for a model that takes none.
 */
function levelsOf(
  models: readonly AgentModel[],
  model: string | null,
  announced: readonly string[],
): readonly string[] {
  const entry = models.find(
    (each) => each.value === (model ?? 'default') || each.resolvedModel === model,
  );
  return entry === undefined ? announced : entry.supportedEffortLevels;
}

/**
 * One scope of defaults — the user's, or a folder's — as a form (plan 13, B-16, B-17; plan 28,
 * B-36). An effort the chosen model does not take is not offered, with why beside it, before
 * anything is sent (S-60); the server checks again, and its refusal comes back translated, saying
 * what to do (S-61).
 *
 * The modes and the levels of effort are the ones the engine announces (plan 28, B-27, B-28): an
 * engine that announces no level has no field of effort at all. The one field besides these that
 * only the active engine has — an output style, say — is its own extension's, saved alongside these
 * the moment the shared "Save" is clicked, never a form of its own (D-06).
 */
export function DefaultsForm({
  heading,
  values,
  effective,
  models,
  saving,
  error,
  folder,
  extra,
  onSave,
  onClear,
}: DefaultsFormProps): React.JSX.Element {
  const { t } = useTranslation();
  // The parent remounts the form when what is stored changes (`key`): the draft starts from it.
  const [draft, setDraft] = useState(values);
  const id = heading.replace(/\W+/g, '-');
  const installationDefault = t('agentSettings.models.installationDefault');
  const extraField = useExtraField(extra, folder);

  const set = (field: DefaultField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value === '' ? null : value }));
  };
  const capabilities = useEngineCapabilities(null);
  const announced = capabilities?.effortLevels ?? [];
  const levels = levelsOf(models, draft.model, announced);
  const effortRefused = refusedEffort(announced, levels, draft.effort);
  const named = (each: readonly AgentModel[]): readonly Option[] =>
    each.map((model) => ({ value: model.value, label: model.displayName }));

  return (
    <form
      aria-labelledby={id}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
        extraField.submit();
      }}
    >
      <h3 id={id} className="text-ui font-ui-strong">
        {heading}
      </h3>

      <Field field="model" effective={effective}>
        <Choice
          value={draft.model}
          none={installationDefault}
          options={named(models)}
          onChange={set('model')}
        />
      </Field>

      <Field field="permissionMode" effective={effective}>
        <Choice
          value={draft.permissionMode}
          none={installationDefault}
          options={(capabilities?.permissionModes ?? []).map((mode) => ({
            value: mode,
            label: t(MODE_NAMES[mode]),
          }))}
          onChange={set('permissionMode')}
        />
      </Field>

      <EffortField
        announced={announced}
        levels={levels}
        value={draft.effort}
        effective={effective}
        onChange={set('effort')}
      />

      <Field field="thinking" effective={effective}>
        <Choice
          value={draft.thinking}
          none={installationDefault}
          options={THINKING_SETTINGS.map((setting) => ({
            value: setting,
            label: t(THINKING_NAMES[setting]),
          }))}
          onChange={set('thinking')}
        />
      </Field>

      {extraField.node}

      <Field field="fallbackModel" effective={effective}>
        <Choice
          value={draft.fallbackModel}
          none={t('agentSettings.models.noFallback')}
          options={named(models.filter((model) => model.value !== draft.model))}
          onChange={set('fallbackModel')}
        />
      </Field>

      {error !== null && <ErrorState error={error} />}
      {extraField.error !== null && <ErrorState error={extraField.error} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="touch" disabled={saving || extraField.saving || effortRefused}>
          {t('agentSettings.models.save')}
        </Button>
        {onClear !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={saving}
            onClick={() => {
              onClear();
              extraField.clear();
            }}
          >
            {t('agentSettings.models.clearFolder')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** An effort chosen that the model does not take — only where the engine announces levels at all. */
function refusedEffort(
  announced: readonly string[],
  levels: readonly string[],
  effort: string | null,
): boolean {
  return announced.length > 0 && effort !== null && !levels.includes(effort);
}

interface EffortFieldProps {
  /** The levels the engine announces — none, and the field is not there (plan 28, B-28). */
  readonly announced: readonly string[];

  /** The ones of them the chosen model takes. */
  readonly levels: readonly string[];
  readonly value: string | null;
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>> | null;
  onChange(value: string): void;
}

/** The effort: the engine's levels, the ones the model does not take shown and not offered (S-60). */
function EffortField({
  announced,
  levels,
  value,
  effective,
  onChange,
}: EffortFieldProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (announced.length === 0) {
    return null;
  }

  return (
    <Field
      field="effort"
      effective={effective}
      refusal={
        refusedEffort(announced, levels, value) ? t('agentSettings.models.effortRefused') : null
      }
    >
      <Choice
        value={value}
        none={t('agentSettings.models.installationDefault')}
        options={announced.map((level) => ({
          value: level,
          label: levelName(EFFORT_NAMES, level, t),
          disabled: !levels.includes(level),
        }))}
        onChange={onChange}
      />
    </Field>
  );
}

/** One choice of a list, already translated. */
interface Option {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface ChoiceProps {
  readonly value: string | null;

  /** The label of "not set here": the installation's default, or no fallback. */
  readonly none: string;
  readonly options: readonly Option[];
  onChange(value: string): void;
}

/** A field that picks one of a list, or none — `null` shown as the first entry. */
function Choice({ value, none, options, onChange }: ChoiceProps): React.JSX.Element {
  return (
    <select
      className={INPUT}
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">{none}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled === true}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface FieldProps {
  readonly field: DefaultField;
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>> | null;
  readonly refusal?: string | null;
  readonly children: React.ReactNode;
}

/** A field of the form: its label, the control, where the value in force comes from, and why not. */
function Field({ field, effective, refusal = null, children }: FieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const keys = FIELD_KEYS[field];
  const now = effective?.[field];

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-ui-sm">
        {t(keys.label)}
        {children}
      </label>
      {now !== undefined && (
        <p className="text-ui-sm text-muted-foreground">
          {t(ORIGIN_NAMES[now.from], { value: now.value ?? '—', folder: now.folder ?? '' })}
        </p>
      )}
      {refusal !== null && (
        <p role="alert" className="text-ui-sm text-destructive">
          {refusal}
        </p>
      )}
      <LearnMore section={keys.help} topic={t(keys.label)} />
    </div>
  );
}

interface ExtraFieldProps {
  readonly labelKey: string;
  readonly value: string | null;
  readonly effective: EffectiveValue | null;
  onChange(value: string): void;
}

/** A plain text field the active engine's own extension adds — an output style, say (D-06). */
function ExtraField({ labelKey, value, effective, onChange }: ExtraFieldProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-ui-sm">
        {t(labelKey)}
        <input
          className={INPUT}
          value={value ?? ''}
          maxLength={128}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
      {effective !== null && (
        <p className="text-ui-sm text-muted-foreground">
          {t(ORIGIN_NAMES[effective.from], {
            value: effective.value ?? '—',
            folder: effective.folder ?? '',
          })}
        </p>
      )}
    </div>
  );
}
