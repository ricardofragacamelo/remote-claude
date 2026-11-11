import { useTranslation } from 'react-i18next';

import { kindShortName } from '@/shared/lib/tool-label';
import { NEW_RULE_KINDS } from '../lib/rule-kind-fields';
import type { NewRuleKind } from '../lib/rule-kind-fields';
import { RuleWizardOption } from './RuleWizardOption';

export interface NewRuleKindStepProps {
  readonly kind: NewRuleKind | null;
  onPick(kind: NewRuleKind): void;
}

/**
 * Step 1: the canonical `kind` the pattern names — command, read and edit a file, search, network,
 * MCP, subagent — most used first, with the translated name `kindShortName` already gives every
 * tool line (plan 15, B-27, step 1). No tool of an engine's own to choose: the rule reaches every
 * engine that has the kind by default (`engine` left out, D-20) — restricting it to one is the
 * pattern step's own, later concern, never this one's.
 */
export function NewRuleKindStep({ kind, onPick }: NewRuleKindStepProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      role="radiogroup"
      aria-label={t('rules.wizard.kindStepLabel')}
    >
      {NEW_RULE_KINDS.map((candidate) => (
        <RuleWizardOption
          key={candidate}
          pressed={kind === candidate}
          className="flex min-h-touch items-center justify-center rounded-md border px-3 text-ui"
          onClick={() => {
            onPick(candidate);
          }}
        >
          {kindShortName(candidate, t)}
        </RuleWizardOption>
      ))}
    </div>
  );
}
