import { useCallback, useState } from 'react';

import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { NewRuleForm } from '../lib/new-rule-pattern';
import type { NewRuleSearch } from '../lib/new-rule-search';
import { subjectFieldOf } from '../lib/rule-kind-fields';
import type { NewRuleKind } from '../lib/rule-kind-fields';

/** One step of the wizard, in the order the task gives them (plan 15, B-27). */
export type NewRuleStep = 'kind' | 'pattern' | 'decision' | 'folder' | 'validity' | 'review';

const STEPS: readonly NewRuleStep[] = [
  'kind',
  'pattern',
  'decision',
  'folder',
  'validity',
  'review',
];

/** Everything the wizard has gathered so far — nothing here is sent until `review`'s own confirm
 * (D-03: a second step, always). */
export interface NewRuleDraft {
  readonly kind: NewRuleKind | null;
  readonly form: NewRuleForm;
  readonly subject: string;

  /** `mcp` only — the tool of `subject`'s server, empty for the whole server. */
  readonly mcpTool: string;
  readonly decision: PermissionDecision | null;
  readonly scope: PersistedScope | null;

  /** Only read while `scope` is `project` — the seletor's own result, never typed. */
  readonly folder: string | null;
  readonly expiresAt: string | null;
}

function draftFrom(initial: NewRuleSearch): NewRuleDraft {
  return {
    kind: initial.kind ?? null,
    form: 'exact',
    subject: initial.pattern ?? '',
    mcpTool: '',
    decision: initial.decision ?? null,
    scope: initial.scope ?? null,
    folder: initial.folder ?? null,
    expiresAt: null,
  };
}

/** Whether `pattern` has what it needs — a kind with no subject field at all (`search`,
 * `web.search`, `agent`) is always a complete draft, with nothing for a person to ever type; a
 * subject-shaped form only completes once something is typed (D-09's own `broad`/`unbounded` is
 * the server's call, at `review`, never a gate here). */
function patternStepComplete(draft: NewRuleDraft): boolean {
  if (draft.kind !== null && subjectFieldOf(draft.kind) === 'none') {
    return true;
  }

  return draft.form === 'any' || draft.subject.trim() !== '';
}

/** Whether the draft has what `step` asks for — never whether the server would accept it: that is
 * the preview's and the review's own job, not a gate on moving forward. */
function isComplete(step: NewRuleStep, draft: NewRuleDraft): boolean {
  switch (step) {
    case 'kind':
      return draft.kind !== null;
    case 'pattern':
      return patternStepComplete(draft);
    case 'decision':
      return draft.decision !== null;
    case 'folder':
      return draft.scope === 'always' || (draft.scope === 'project' && draft.folder !== null);
    case 'validity':
      return draft.expiresAt !== null;
    case 'review':
      return true;
  }
}

export interface NewRuleFlow {
  readonly step: NewRuleStep;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly draft: NewRuleDraft;
  setDraft(patch: Partial<NewRuleDraft>): void;

  /** Whether `step`'s own fields are filled in — what gates the Next button, never the server's
   * own opinion of them. */
  readonly canAdvance: boolean;
  next(): void;
  back(): void;

  /** Jumps straight to a step already completed — a reopened wizard that lands on `review`
   * (S-203's own template hand-off, once B-30 exists) still lets every earlier step be revisited. */
  goTo(step: NewRuleStep): void;
}

/**
 * The rule-authoring wizard's own steps and draft (plan 15, B-27) — kind, pattern, decision,
 * where it reaches, validity, review, in that order, with nothing sent to the server before
 * `review`'s own confirm. `initial` seeds the draft from `/rules/new`'s own search (D-19): a
 * hand-off from Recriar (decision, scope, folder — never the untranslatable pattern, S-225) or,
 * once B-30 exists, a duplicate or a template.
 */
export function useNewRuleFlow(initial: NewRuleSearch): NewRuleFlow {
  const [step, setStep] = useState<NewRuleStep>('kind');
  const [draft, setDraftState] = useState<NewRuleDraft>(() => draftFrom(initial));

  const setDraft = useCallback((patch: Partial<NewRuleDraft>) => {
    setDraftState((current) => ({ ...current, ...patch }));
  }, []);

  const stepIndex = STEPS.indexOf(step);

  const next = useCallback(() => {
    const nextStep = STEPS[STEPS.indexOf(step) + 1];
    if (nextStep !== undefined) {
      setStep(nextStep);
    }
  }, [step]);

  const back = useCallback(() => {
    const previousStep = STEPS[STEPS.indexOf(step) - 1];
    if (previousStep !== undefined) {
      setStep(previousStep);
    }
  }, [step]);

  return {
    step,
    stepIndex,
    stepCount: STEPS.length,
    draft,
    setDraft,
    canAdvance: isComplete(step, draft),
    next,
    back,
    goTo: setStep,
  };
}
