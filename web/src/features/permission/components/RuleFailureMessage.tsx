import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface RuleFailureMessageProps {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Why the last write for one rule (or lot) failed — beside the row, or the panel, it was for.
 *
 * Takes focus the moment it appears (plan 15, B-32) — every caller already mounts this only once
 * an action this component is not itself part of has just failed, so there is always a keyboard
 * user left exactly where the error now is, never further away from it than before.
 */
export function RuleFailureMessage({
  messageKey,
  params,
}: RuleFailureMessageProps): React.JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);

  // Re-focuses on a *different* failure too — a retry that fails again a different way is still a
  // new thing to read, even while this component never unmounts between the two.
  useEffect(() => {
    ref.current?.focus();
  }, [messageKey]);

  return (
    <p ref={ref} tabIndex={-1} className="text-ui-xs text-destructive" role="alert">
      {t(messageKey, params)}
    </p>
  );
}
