import { useTranslation } from 'react-i18next';

import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import type { HelpTarget } from '@/shared/hooks/useHelpPanel';

export interface LearnMoreProps {
  /** The part of the screen's help that answers the doubt. */
  readonly section: HelpTarget;

  /** What the doubt is about, translated — "the allowlist" — for the name a screen reader hears. */
  readonly topic: string;
}

/**
 * "Learn more", beside a control people stop at — the allowlist, the ceiling of tabs, a device
 * waiting: it opens the screen's help at the part that answers it (plan 06, S-153).
 *
 * Nothing where the screen has no help to open — a link that opened nothing would be worse than none.
 */
export function LearnMore({ section, topic }: LearnMoreProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const hosts = useHelpPanel((state) => state.hosts);
  const show = useHelpPanel((state) => state.show);

  if (hosts === 0) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={t('help.learnMore.label', { topic })}
      className="inline-flex min-h-touch items-center self-start text-ui-sm underline underline-offset-4 md:min-h-0"
      onClick={() => {
        show(section);
      }}
    >
      {t('help.learnMore.action')}
    </button>
  );
}
