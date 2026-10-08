import { useTranslation } from 'react-i18next';

/** How long a request has before the deadline refuses it — silence refuses, so it is always shown. */
export function PermissionCountdown({
  remainingMs,
}: {
  readonly remainingMs: number;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <span className="text-xs opacity-70" role="timer">
      {t('permission.card.remaining', { seconds: Math.ceil(remainingMs / 1_000) })}
    </span>
  );
}
