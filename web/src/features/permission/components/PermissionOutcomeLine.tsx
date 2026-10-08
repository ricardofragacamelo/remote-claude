import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { PermissionOutcome } from '../types/permission';

/** How a request was settled, in words: by the deadline, by a rule, by Permitir tudo, by this screen, or by whom. */
function sentenceOf(outcome: PermissionOutcome, t: TFunction): string {
  const decision = t(`permission.verdict.${outcome.decision}`);

  if (outcome.auto) {
    return automaticSentence(outcome, t);
  }

  if (outcome.answeredHere) {
    return t('permission.outcome.byYou', { decision });
  }

  // A decision a person made always has an author; one the server sent without one names nobody
  // rather than leaving a blank (plan 03).
  const who = outcome.resolvedBy ?? t('permission.outcome.somebody');

  switch (outcome.resolvedFrom) {
    case 'mobile':
      return t('permission.outcome.onPhone', { decision, who });
    case 'web':
      return t('permission.outcome.inBrowser', { decision, who });
    default:
      return t('permission.outcome.by', { decision, who });
  }
}

/**
 * A decision nobody made: the deadline's refusal, Permitir tudo's yes, or a rule's answer — and an
 * automatic yes this build cannot name reads as a rule, the sentence there was before the mode
 * existed (plan 23, S-81, S-82).
 */
function automaticSentence(outcome: PermissionOutcome, t: TFunction): string {
  if (outcome.decision === 'deny') {
    return t(outcome.via === null ? 'permission.outcome.expired' : 'permission.outcome.ruleDenied');
  }

  return t(outcome.via === 'allowAll' ? 'permission.outcome.allowAll' : 'permission.outcome.rule');
}

/**
 * The line the card of a request becomes once it is settled (plan 09, B-23): "allowed by you",
 * "refused — nobody answered in time", "allowed on a phone by X", "allowed by one of your rules". A
 * card that simply vanished would read as a bug — a request answered on a phone leaves on its own.
 */
export function PermissionOutcomeLine({
  outcome,
}: {
  readonly outcome: PermissionOutcome;
}): React.JSX.Element {
  const { t } = useTranslation();

  return <p className="ml-5 text-ui-xs text-muted-foreground">{sentenceOf(outcome, t)}</p>;
}
