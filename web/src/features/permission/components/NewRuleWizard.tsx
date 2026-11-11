import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useWizardStepFocus } from '@/shared/hooks/useWizardStepFocus';
import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { useNewRuleFlow } from '../hooks/useNewRuleFlow';
import { useRulePreview } from '../hooks/useRulePreview';
import { patternOf } from '../lib/new-rule-pattern';
import type { NewRuleSearch } from '../lib/new-rule-search';
import type { NewRuleDraft, NewRuleFlow, NewRuleStep } from '../hooks/useNewRuleFlow';
import type { PermissionRule, PreviewRuleInput, RulePreview } from '../types/rule';
import { NewRuleDecisionStep } from './NewRuleDecisionStep';
import { NewRuleFolderStep } from './NewRuleFolderStep';
import { NewRuleKindStep } from './NewRuleKindStep';
import { NewRulePatternStep } from './NewRulePatternStep';
import { NewRuleReviewStep } from './NewRuleReviewStep';
import { NewRuleValidityStep } from './NewRuleValidityStep';
import { RuleFailureMessage } from './RuleFailureMessage';

/** What the review step needs, whichever of the two bodies below renders it. */
interface ReviewHandoff {
  readonly pattern: string;
  readonly preview: AsyncRead<RulePreview>;
  readonly acknowledgeBroad: boolean;
  onAcknowledgeBroad(value: boolean): void;
  onOpenRule(ruleId: string): void;
  onCreated(rule: PermissionRule): void;
}

const STEP_LABEL_KEY: Readonly<Record<NewRuleStep, string>> = {
  kind: 'rules.wizard.stepKind',
  pattern: 'rules.wizard.stepPattern',
  decision: 'rules.wizard.stepDecision',
  folder: 'rules.wizard.stepFolder',
  validity: 'rules.wizard.stepValidity',
  review: 'rules.wizard.stepReview',
};

export interface NewRuleWizardProps {
  readonly initial: NewRuleSearch;
  onCancel(): void;
  onCreated(rule: PermissionRule): void;
  onOpenRule(ruleId: string): void;
}

/**
 * The rule-authoring wizard, in full (plan 15, B-27): kind, pattern, decision, where it reaches,
 * validity, review — nothing sent before the last step's own confirm (D-03). The container, not a
 * button inside it, takes the focus on every step change (`useWizardStepFocus`) — the one thing
 * that lets the whole wizard be completed with the keyboard alone, start to finish (S-210).
 */
export function NewRuleWizard({
  initial,
  onCancel,
  onCreated,
  onOpenRule,
}: NewRuleWizardProps): React.JSX.Element {
  const { t } = useTranslation();
  const flow = useNewRuleFlow(initial);
  const { step, draft, canAdvance, next, back } = flow;
  const [acknowledgeBroad, setAcknowledgeBroad] = useState(false);
  const stepRef = useWizardStepFocus<HTMLDivElement>(step);

  const pattern = draft.kind === null ? '' : patternOf({ ...draft, kind: draft.kind });
  const preview = useRulePreview(reviewPreviewInput(step, draft, pattern));

  return (
    <div ref={stepRef} tabIndex={-1} className="flex flex-col gap-4 focus:outline-none">
      <p className="text-ui-sm font-ui-strong text-muted-foreground">
        {t('rules.wizard.stepOf', { step: t(STEP_LABEL_KEY[step]) })}
      </p>

      <WizardStepBody
        flow={flow}
        pattern={pattern}
        preview={preview}
        acknowledgeBroad={acknowledgeBroad}
        onAcknowledgeBroad={setAcknowledgeBroad}
        onOpenRule={onOpenRule}
        onCreated={onCreated}
      />

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (step === 'kind') {
              onCancel();
            } else {
              back();
            }
          }}
        >
          {step === 'kind' ? t('rules.wizard.cancel') : t('rules.wizard.back')}
        </Button>

        {step !== 'review' && (
          <Button type="button" disabled={!canAdvance} onClick={next}>
            {t('rules.wizard.next')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The draft's own pattern preview, under the real decision/scope — only once `review` has both,
 * `null` everywhere else: the pattern step already reads its own, under a placeholder pair. */
function reviewPreviewInput(
  step: NewRuleStep,
  draft: NewRuleDraft,
  pattern: string,
): PreviewRuleInput | null {
  if (step !== 'review' || draft.decision === null || draft.scope === null) {
    return null;
  }

  return {
    pattern,
    decision: draft.decision,
    scope: draft.scope,
    ...(draft.scope === 'project' && draft.folder !== null ? { projectPath: draft.folder } : {}),
  };
}

function WizardStepBody({
  flow,
  pattern,
  preview,
  acknowledgeBroad,
  onAcknowledgeBroad,
  onOpenRule,
  onCreated,
}: ReviewHandoff & { readonly flow: NewRuleFlow }): React.JSX.Element | null {
  const { step, draft, setDraft, goTo } = flow;

  switch (step) {
    case 'kind':
      return (
        <NewRuleKindStep
          kind={draft.kind}
          onPick={(kind) => {
            setDraft({ kind });
          }}
        />
      );
    case 'pattern':
      // `kind` is only unset while `step === 'kind'` — the Next button leaving that step stays
      // disabled until it is (`isComplete('kind', draft)`, `useNewRuleFlow.ts`), so this step never
      // renders with it still null.
      return (
        <NewRulePatternStep
          kind={draft.kind!}
          form={draft.form}
          subject={draft.subject}
          mcpTool={draft.mcpTool}
          onChange={setDraft}
        />
      );
    case 'decision':
      return (
        <NewRuleDecisionStep
          decision={draft.decision}
          onPick={(decision) => {
            setDraft({ decision });
          }}
        />
      );
    case 'folder':
      return <NewRuleFolderStep scope={draft.scope} folder={draft.folder} onChange={setDraft} />;
    case 'validity':
      // Same invariant as `pattern` above, for `decision`'s own gate on leaving `decision`.
      return (
        <NewRuleValidityStep
          decision={draft.decision!}
          expiresAt={draft.expiresAt}
          onPick={(expiresAt) => {
            setDraft({ expiresAt });
          }}
        />
      );
    case 'review':
      return (
        <ReviewStepBody
          draft={draft}
          pattern={pattern}
          // `idle` only happens before `review`'s own preview key exists — `reviewPreviewInput`
          // returns `null` for every other step, computed fresh in the very same render that flips
          // `step` to `review`, so this step never renders while it is still `idle`.
          preview={preview as Exclude<AsyncRead<RulePreview>, { status: 'idle' }>}
          acknowledgeBroad={acknowledgeBroad}
          onAcknowledgeBroad={onAcknowledgeBroad}
          onOpenRule={onOpenRule}
          onCreated={onCreated}
          onFolderRefused={() => {
            goTo('folder');
          }}
        />
      );
  }
}

function ReviewStepBody({
  draft,
  pattern,
  preview,
  acknowledgeBroad,
  onAcknowledgeBroad,
  onOpenRule,
  onCreated,
  onFolderRefused,
}: Omit<ReviewHandoff, 'preview'> & {
  readonly preview: Exclude<AsyncRead<RulePreview>, { status: 'idle' }>;
  readonly draft: NewRuleDraft;
  onFolderRefused(): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (preview.status === 'loading') {
    return <p role="status">{t('rules.wizard.previewLoading')}</p>;
  }

  if (preview.status === 'failed') {
    return (
      <RuleFailureMessage messageKey={preview.error.messageKey} params={preview.error.params} />
    );
  }

  // `decision`/`scope`/`expiresAt` are only unset before their own step's Next button lets a person
  // leave it (same invariant `WizardStepBody`'s `pattern`/`validity` cases already rely on) — all
  // three are set by the time `review`, the last step, ever renders.
  return (
    <NewRuleReviewStep
      pattern={pattern}
      decision={draft.decision!}
      scope={draft.scope!}
      folder={draft.folder}
      expiresAt={draft.expiresAt!}
      preview={preview.value}
      acknowledgeBroad={acknowledgeBroad}
      onAcknowledgeBroad={onAcknowledgeBroad}
      onOpenRule={onOpenRule}
      onGranted={onCreated}
      onFolderRefused={onFolderRefused}
    />
  );
}
