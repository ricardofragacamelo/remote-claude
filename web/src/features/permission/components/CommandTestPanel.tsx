import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/components/ui/button';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { kindShortName } from '@/shared/lib/tool-label';
import { useRuleEvaluation } from '../hooks/useRuleEvaluation';
import type { CommandTestDraft, DraftRuleHandoff, TestableMode } from '../lib/evaluate-input';
import { TESTABLE_MODES, evaluationInputOf } from '../lib/evaluate-input';
import { verdictOf } from '../lib/evaluation-verdict';
import { NEW_RULE_KINDS, subjectFieldOf } from '../lib/rule-kind-fields';
import type { NewRuleKind, SubjectField } from '../lib/rule-kind-fields';
import type { RuleEvaluation } from '../types/rule';
import { NewRuleFolderDialog } from './NewRuleFolderDialog';
import { RadioOptionGroup } from './RadioOptionGroup';
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleFailureMessage } from './RuleFailureMessage';

export interface CommandTestPanelProps {
  /** The rule being authored in the wizard's own review step, counted as if it already existed
   * (S-198, D-12) — absent for the standalone panel, which only has what is already granted. */
  readonly draft?: DraftRuleHandoff;
  onOpenRule(ruleId: string): void;
}

/**
 * "Testar um comando" (plan 15, B-28): the kind, its subject field, a folder from the seletor, and
 * the canonical mode, read live as every field changes, same as the wizard's own pattern preview
 * (S-196, S-197). Reused as-is both standalone (the rules screen's header action and palette, its
 * own route) and inside the wizard's review step, next to the pattern (S-198).
 *
 * D-12's own "nesta sessão" (a live session's current mode, instead of one picked by hand) is cut
 * from this step: the only way to read a folder's live session from here is through
 * `@/features/session`'s own barrel, whose `register-changes`/`register-context` reach
 * `@/features/editor`'s barrel — a module-level side effect (`registerEditor()`) that would then
 * run wherever this component's own module loads, which is every test file in the suite
 * (`test/support/setup.ts` already imports `@/features/permission`, whose own barrel would need to
 * export this component). Found during this same task, by the breakage it caused two plans away
 * (`settings-sections.spec.ts`'s own D-13/S-142, `EditorAreaAndKeepers.spec.tsx`'s own "already
 * registered") — reverted rather than fixed forward, since a plan 15 task is not the place to
 * change plan 06/07's own test assumptions. A later task may revisit this once that coupling has
 * a safer way through.
 */
export function CommandTestPanel({ draft, onOpenRule }: CommandTestPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [kind, setKind] = useState<NewRuleKind | null>(null);
  const [value, setValue] = useState('');
  const [mcpTool, setMcpTool] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [mode, setMode] = useState<TestableMode>('ask');

  const debouncedValue = useDebouncedValue(value, 400);
  const debouncedMcpTool = useDebouncedValue(mcpTool, 400);

  const draftInput: CommandTestDraft = {
    kind,
    value: debouncedValue,
    mcpTool: debouncedMcpTool,
    mode,
    ...(folder === null ? {} : { folder }),
    ...(draft === undefined ? {} : { draft }),
  };

  const evaluation = useRuleEvaluation(evaluationInputOf(draftInput));

  return (
    <div className="flex flex-col gap-4">
      <RadioOptionGroup
        label={t('rules.test.kindStepLabel')}
        options={NEW_RULE_KINDS}
        value={kind}
        onPick={(candidate) => {
          setKind(candidate);
        }}
        labelOf={(candidate) => kindShortName(candidate, t)}
        outerClassName="flex flex-wrap gap-2"
        optionClassName="flex min-h-touch items-center rounded-md border px-3 text-ui-sm"
      />
      <SubjectFields
        kind={kind}
        value={value}
        onValue={setValue}
        mcpTool={mcpTool}
        onMcpTool={setMcpTool}
        t={t}
      />
      <FolderPicker
        folder={folder}
        onChoose={setFolder}
        onClear={() => {
          setFolder(null);
        }}
        t={t}
      />

      <RadioOptionGroup
        label={t('rules.test.modeStepLabel')}
        options={TESTABLE_MODES}
        value={mode}
        onPick={(candidate) => {
          setMode(candidate);
        }}
        labelOf={(candidate) => t(`sessions.mode.${candidate}`)}
        outerClassName="flex flex-wrap gap-2"
        optionClassName="flex min-h-touch items-center rounded-md border px-3 text-ui-sm"
      />

      {evaluation.status === 'loading' && <p role="status">{t('rules.test.loading')}</p>}

      {evaluation.status === 'failed' && (
        <RuleFailureMessage
          messageKey={evaluation.error.messageKey}
          params={evaluation.error.params}
        />
      )}

      {evaluation.status === 'ready' && (
        <EvaluationResult evaluation={evaluation.value} onOpenRule={onOpenRule} />
      )}
    </div>
  );
}

const SUBJECT_LABEL_KEY: Readonly<Record<SubjectField, string>> = {
  command: 'rules.wizard.subjectCommand',
  path: 'rules.wizard.subjectPath',
  domain: 'rules.wizard.subjectDomain',
  mcp: 'rules.wizard.mcpServer',
  none: '',
};

function SubjectFields({
  kind,
  value,
  onValue,
  mcpTool,
  onMcpTool,
  t,
}: {
  readonly kind: NewRuleKind | null;
  readonly value: string;
  onValue(value: string): void;
  readonly mcpTool: string;
  onMcpTool(value: string): void;
  readonly t: TFunction;
}): React.JSX.Element | null {
  if (kind === null) {
    return null;
  }

  const field = subjectFieldOf(kind);

  if (field === 'none') {
    return (
      <p className="text-ui-sm text-muted-foreground">
        {t('rules.test.subjectOptionalBody', { kind })}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        className="rounded-md border px-3 py-2 text-ui-sm"
        aria-label={t(SUBJECT_LABEL_KEY[field])}
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
        }}
      />
      {field === 'mcp' && (
        <input
          className="rounded-md border px-3 py-2 text-ui-sm"
          aria-label={t('rules.wizard.mcpTool')}
          placeholder={t('rules.wizard.mcpToolPlaceholder')}
          value={mcpTool}
          onChange={(event) => {
            onMcpTool(event.target.value);
          }}
        />
      )}
    </div>
  );
}

function FolderPicker({
  folder,
  onChoose,
  onClear,
  t,
}: {
  readonly folder: string | null;
  onChoose(folder: string): void;
  onClear(): void;
  readonly t: TFunction;
}): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setPickerOpen(true);
        }}
      >
        {folder === null ? t('rules.test.folderChoose') : t('rules.test.folderChangeChoice')}
      </Button>
      {folder !== null && <code className="text-ui-sm">{folder}</code>}
      {folder !== null && (
        <Button type="button" variant="outline" onClick={onClear}>
          {t('rules.test.folderClear')}
        </Button>
      )}
      <NewRuleFolderDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onChoose={(path) => {
          onChoose(path);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function EvaluationResult({
  evaluation,
  onOpenRule,
}: {
  readonly evaluation: RuleEvaluation;
  onOpenRule(ruleId: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const verdict = verdictOf(evaluation);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui font-ui-strong" role="status">
        {t(verdict.messageKey, verdict.params)}
      </p>

      {evaluation.matching.length > 0 && (
        <section>
          <h3 className="text-ui-sm font-ui-strong">{t('rules.test.matching')}</h3>
          <ul className="flex flex-col gap-1">
            {evaluation.matching.map((rule) => (
              <MatchingRuleRow key={rule.id} rule={rule} onOpenRule={onOpenRule} />
            ))}
          </ul>
        </section>
      )}

      {evaluation.caveats.length > 0 && (
        <section>
          <h3 className="text-ui-sm font-ui-strong">{t('rules.test.caveats')}</h3>
          <ul className="flex flex-col gap-1 text-ui-xs text-muted-foreground">
            {evaluation.caveats.map((caveat, index) => (
              // A caveat has no id of its own on the wire, same as a finding (`RuleAlerts`).
              <li key={`${caveat.messageKey}-${index}`}>{t(caveat.messageKey, caveat.params)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A matching rule may carry `scope: 'session'` (D-12) — the one scope the web's own narrowed
 * `PermissionRule` never has, so this reads the evaluation's own element type instead. */
type MatchingRule = RuleEvaluation['matching'][number];

function MatchingRuleRow({
  rule,
  onOpenRule,
}: {
  readonly rule: MatchingRule;
  onOpenRule(ruleId: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-ui-xs">
      <span className="flex items-center gap-2">
        <RuleDecisionChip decision={rule.decision} />
        <code>{rule.pattern}</code>
      </span>
      <Button
        variant="outline"
        size="touch"
        onClick={() => {
          onOpenRule(rule.id);
        }}
      >
        {t('permission.ruleDetail.openInvolvedRule')}
      </Button>
    </li>
  );
}
