import { useTranslation } from 'react-i18next';

import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { kindShortName } from '@/shared/lib/tool-label';
import { useRulePreview } from '../hooks/useRulePreview';
import { patternOf } from '../lib/new-rule-pattern';
import type { NewRuleForm, NewRulePatternDraft } from '../lib/new-rule-pattern';
import { allowsPrefix, subjectFieldOf } from '../lib/rule-kind-fields';
import type { NewRuleKind, SubjectField } from '../lib/rule-kind-fields';
import { actionText } from '../lib/rule-sentence';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import type { RulePreview } from '../types/rule';
import { RuleFailureMessage } from './RuleFailureMessage';
import { RuleWizardOption } from './RuleWizardOption';

const FIELD_LABEL_KEY = {
  command: 'rules.wizard.subjectCommand',
  path: 'rules.wizard.subjectPath',
  domain: 'rules.wizard.subjectDomain',
} as const;

const OPTION_CLASS = 'flex min-h-touch items-center rounded-md border px-3 text-ui-sm';
const MONO_INPUT_CLASS =
  'h-10 rounded-md border border-border bg-transparent px-3 font-mono text-sm';

export interface NewRulePatternStepProps {
  readonly kind: NewRuleKind;
  readonly form: NewRuleForm;
  readonly subject: string;
  readonly mcpTool: string;
  onChange(patch: Partial<Pick<NewRulePatternStepProps, 'form' | 'subject' | 'mcpTool'>>): void;
}

/**
 * Step 2: the subject the chosen `kind` reads, in the canonical grammar (D-20) — never a tool name
 * of an engine's own. The pattern itself is built here, never typed loose, and shown back in mono
 * as confirmation (plan 15, B-27, S-185); the live sentence and grammar error come from the
 * server's own preview, debounced, read under a placeholder `allow`/`always` — the width `allow`
 * and `deny` differ on (D-09) is the review step's own, once the real decision is known.
 */
export function NewRulePatternStep({
  kind,
  form,
  subject,
  mcpTool,
  onChange,
}: NewRulePatternStepProps): React.JSX.Element {
  const field = subjectFieldOf(kind);
  const draft: NewRulePatternDraft = { kind, form, subject, mcpTool };
  const pattern = patternOf(draft);
  const debouncedPattern = useDebouncedValue(pattern, 400);

  // Nothing worth asking the server about yet: a subject-shaped form with nothing typed in it is
  // still mid-draft, not a pattern — `patternOf` would otherwise fall back to the whole kind and
  // the preview would say something the person has not chosen.
  const ready = field === 'none' || form === 'any' || subject.trim() !== '';
  const preview = useRulePreview(
    ready ? { pattern: debouncedPattern, decision: 'allow', scope: 'always' } : null,
  );

  return (
    <div className="flex flex-col gap-4">
      <SubjectFields kind={kind} field={field} form={form} subject={subject} onChange={onChange} />

      {field === 'mcp' && <McpFields subject={subject} mcpTool={mcpTool} onChange={onChange} />}

      <PatternPreview pattern={pattern} />

      {ready && <PreviewFeedback preview={preview} kind={kind} />}
    </div>
  );
}

function LabeledMonoInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  onChange(value: string): void;
  readonly placeholder?: string;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-ui-sm">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        className={MONO_INPUT_CLASS}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

function SubjectFields({
  kind,
  field,
  form,
  subject,
  onChange,
}: {
  readonly kind: NewRuleKind;
  readonly field: SubjectField;
  readonly form: NewRuleForm;
  readonly subject: string;
  onChange: NewRulePatternStepProps['onChange'];
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (field === 'none' || field === 'mcp') {
    return field === 'none' ? (
      <p className="text-ui-sm text-muted-foreground">
        {t('rules.wizard.patternWholeKindOnly', { kind: kindShortName(kind, t) })}
      </p>
    ) : null;
  }

  return (
    <>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={t('rules.wizard.patternFormLabel')}
      >
        <RuleWizardOption
          className={OPTION_CLASS}
          pressed={form === 'any'}
          onClick={() => {
            onChange({ form: 'any' });
          }}
        >
          {t('rules.wizard.formAny', { kind: kindShortName(kind, t) })}
        </RuleWizardOption>
        <RuleWizardOption
          className={OPTION_CLASS}
          pressed={form === 'exact'}
          onClick={() => {
            onChange({ form: 'exact' });
          }}
        >
          {t('rules.wizard.formExact')}
        </RuleWizardOption>
        {allowsPrefix(kind) && (
          <RuleWizardOption
            className={OPTION_CLASS}
            pressed={form === 'prefix'}
            onClick={() => {
              onChange({ form: 'prefix' });
            }}
          >
            {t('rules.wizard.formPrefix')}
          </RuleWizardOption>
        )}
      </div>

      {form !== 'any' && (
        <LabeledMonoInput
          label={t(FIELD_LABEL_KEY[field])}
          value={subject}
          onChange={(value) => {
            onChange({ subject: value });
          }}
        />
      )}
    </>
  );
}

function McpFields({
  subject,
  mcpTool,
  onChange,
}: {
  readonly subject: string;
  readonly mcpTool: string;
  onChange: NewRulePatternStepProps['onChange'];
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <LabeledMonoInput
        label={t('rules.wizard.mcpServer')}
        value={subject}
        onChange={(value) => {
          onChange({ subject: value });
        }}
      />
      <LabeledMonoInput
        label={t('rules.wizard.mcpTool')}
        value={mcpTool}
        placeholder={t('rules.wizard.mcpToolPlaceholder')}
        onChange={(value) => {
          onChange({ mcpTool: value });
        }}
      />
    </>
  );
}

function PatternPreview({ pattern }: { readonly pattern: string }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <p
      className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-ui-sm"
      aria-label={t('rules.wizard.patternPreviewLabel')}
    >
      {pattern}
    </p>
  );
}

function PreviewFeedback({
  preview,
  kind,
}: {
  readonly preview: AsyncRead<RulePreview>;
  readonly kind: NewRuleKind;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (preview.status === 'ready') {
    return (
      <p className="text-ui-sm text-muted-foreground">{actionText(preview.value.reach, kind, t)}</p>
    );
  }

  if (preview.status === 'failed') {
    return (
      <RuleFailureMessage messageKey={preview.error.messageKey} params={preview.error.params} />
    );
  }

  return null;
}
