import { useTranslation } from 'react-i18next';

export interface RuleFailureMessageProps {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Why the last write for one rule (or lot) failed — beside the row, or the panel, it was for. */
export function RuleFailureMessage({
  messageKey,
  params,
}: RuleFailureMessageProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <p className="text-ui-xs text-destructive" role="alert">
      {t(messageKey, params)}
    </p>
  );
}
