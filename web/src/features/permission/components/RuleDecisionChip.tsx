import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import type { PermissionDecision } from '../types/permission';

const TONE: Readonly<Record<PermissionDecision, string>> = {
  allow: 'bg-success/15 text-success',
  deny: 'bg-destructive/15 text-destructive',
};

const ICON = { allow: Check, deny: Ban } as const;

/** Permite or Bloqueia, as a chip — colour is never the only way to tell them apart (the icon and the word are too). */
export function RuleDecisionChip({
  decision,
}: {
  readonly decision: PermissionDecision;
}): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = ICON[decision];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-ui-xs',
        TONE[decision],
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(`rules.decision.${decision}`)}
    </span>
  );
}
