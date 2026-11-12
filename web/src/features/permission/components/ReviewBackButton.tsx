import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

/** The button every import/template review step opens with, back to its own picker (B-30, B-31). */
export function ReviewBackButton({
  onBack,
  labelKey,
}: {
  onBack(): void;
  readonly labelKey: string;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Button type="button" variant="outline" onClick={onBack}>
      {t(labelKey)}
    </Button>
  );
}
