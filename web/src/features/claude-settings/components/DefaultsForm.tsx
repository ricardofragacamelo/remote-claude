import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import { DEFAULT_MODES, EFFORT_LEVELS, THINKING_SETTINGS } from '../types/defaults';
import type {
  ClaudeDefaults,
  ClaudeModel,
  DefaultField,
  DefaultsOrigin,
  EffectiveValue,
} from '../types/defaults';

const INPUT = 'h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8';

/** The label and the help of each field, named in full. */
const FIELD_KEYS: Readonly<
  Record<DefaultField, { readonly label: string; readonly help: string }>
> = {
  model: { label: 'claudeSettings.models.model', help: 'claude-model' },
  permissionMode: { label: 'claudeSettings.models.permissionMode', help: 'claude-modes' },
  effort: { label: 'claudeSettings.models.effort', help: 'claude-effort' },
  thinking: { label: 'claudeSettings.models.thinking', help: 'claude-thinking' },
  outputStyle: { label: 'claudeSettings.models.outputStyle', help: 'claude-outputStyle' },
  fallbackModel: { label: 'claudeSettings.models.fallbackModel', help: 'claude-model' },
};

/** Each mode, named in full. */
export const MODE_NAMES: Readonly<Record<(typeof DEFAULT_MODES)[number], string>> = {
  default: 'claudeSettings.models.modeDefault',
  acceptEdits: 'claudeSettings.models.modeAcceptEdits',
  plan: 'claudeSettings.models.modePlan',
  allowAll: 'claudeSettings.models.modeAllowAll',
};

const EFFORT_NAMES: Readonly<Record<(typeof EFFORT_LEVELS)[number], string>> = {
  low: 'claudeSettings.models.effortLow',
  medium: 'claudeSettings.models.effortMedium',
  high: 'claudeSettings.models.effortHigh',
  xhigh: 'claudeSettings.models.effortXhigh',
  max: 'claudeSettings.models.effortMax',
};

const THINKING_NAMES: Readonly<Record<(typeof THINKING_SETTINGS)[number], string>> = {
  on: 'claudeSettings.models.thinkingOn',
  off: 'claudeSettings.models.thinkingOff',
};

/** Where an effective value came from, named in full. */
const ORIGIN_NAMES: Readonly<Record<DefaultsOrigin, string>> = {
  folder: 'claudeSettings.models.fromFolder',
  user: 'claudeSettings.models.fromUser',
  installation: 'claudeSettings.models.fromInstallation',
};

export interface DefaultsFormProps {
  /** `user` or `folder` — the scope the form writes, said in its heading. */
  readonly heading: string;
  readonly values: ClaudeDefaults;

  /** What applies here now, and from where — shown under each field. */
  readonly effective: Readonly<Record<DefaultField, EffectiveValue>> | null;
  readonly models: readonly ClaudeModel[];
  readonly saving: boolean;
  readonly error: ErrorStateProps['error'] | null;
  onSave(values: ClaudeDefaults): void;
  onClear?(): void;
}

/** The levels of effort a model declares — none for a model that takes none. */
function levelsOf(models: readonly ClaudeModel[], model: string | null): readonly string[] {
  const entry = models.find(
    (each) => each.value === (model ?? 'default') || each.resolvedModel === model,
  );
  return entry === undefined ? EFFORT_LEVELS : entry.supportedEffortLevels;
}

/**
 * One scope of defaults — the user's, or a folder's — as a form (plan 13, B-16, B-17). An effort the
 * chosen model does not take is not offered, with why beside it, before anything is sent (S-60); the
 * server checks again, and its refusal comes back translated, saying what to do (S-61).
 */
export function DefaultsForm({
  heading,
  values,
  effective,
  models,
  saving,
  error,
  onSave,
  onClear,
}: DefaultsFormProps): React.JSX.Element {
  const { t } = useTranslation();
  // The parent remounts the form when what is stored changes (`key`): the draft starts from it.
  const [draft, setDraft] = useState(values);
  const id = heading.replace(/\W+/g, '-');
  const installationDefault = t('claudeSettings.models.installationDefault');

  const set = (field: DefaultField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value === '' ? null : value }));
  };
  const levels = levelsOf(models, draft.model);
  const effortRefused = draft.effort !== null && !levels.includes(draft.effort);
  const named = (each: readonly ClaudeModel[]): readonly Option[] =>
    each.map((model) => ({ value: model.value, label: model.displayName }));

  return (
    <form
      aria-labelledby={id}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
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
          options={DEFAULT_MODES.map((mode) => ({ value: mode, label: t(MODE_NAMES[mode]) }))}
          onChange={set('permissionMode')}
        />
      </Field>

      <Field
        field="effort"
        effective={effective}
        refusal={effortRefused ? t('claudeSettings.models.effortRefused') : null}
      >
        <Choice
          value={draft.effort}
          none={installationDefault}
          options={EFFORT_LEVELS.map((level) => ({
            value: level,
            label: t(EFFORT_NAMES[level]),
            disabled: !levels.includes(level),
          }))}
          onChange={set('effort')}
        />
      </Field>

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

      <Field field="outputStyle" effective={effective}>
        <input
          className={INPUT}
          value={draft.outputStyle ?? ''}
          maxLength={128}
          onChange={(event) => {
            set('outputStyle')(event.target.value);
          }}
        />
      </Field>

      <Field field="fallbackModel" effective={effective}>
        <Choice
          value={draft.fallbackModel}
          none={t('claudeSettings.models.noFallback')}
          options={named(models.filter((model) => model.value !== draft.model))}
          onChange={set('fallbackModel')}
        />
      </Field>

      {error !== null && <ErrorState error={error} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="touch" disabled={saving || effortRefused}>
          {t('claudeSettings.models.save')}
        </Button>
        {onClear !== undefined && (
          <Button type="button" variant="outline" size="touch" disabled={saving} onClick={onClear}>
            {t('claudeSettings.models.clearFolder')}
          </Button>
        )}
      </div>
    </form>
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
