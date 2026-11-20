import { useTranslation } from 'react-i18next';

import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import type { HelpTarget } from '@/shared/hooks/useHelpPanel';

/**
 * Either the part of the **screen's** own help that answers the doubt (the `ScreenFrame`'s, or the
 * workbench's own) — or, for a help that is a **part** of the screen instead (`HelpSheet`'s `own`,
 * plan 11, B-20), what opens it: there is no section to jump to inside one of those yet, only the
 * whole sheet.
 */
export type LearnMoreProps =
  | { readonly section: HelpTarget; readonly topic: string; readonly onOpen?: undefined }
  | { readonly section?: undefined; readonly topic: string; onOpen(): void };

/**
 * "Learn more", beside a control people stop at — the allowlist, the ceiling of tabs, a device
 * waiting: it opens the screen's help at the part that answers it (plan 06, S-153). With `onOpen`
 * instead of `section`, it opens a part of the screen's own help (plan 11, B-20, S-142) — whole,
 * since that one has no "which part" of its own to ask for yet.
 *
 * Nothing where the screen has no help to open — a link that opened nothing would be worse than
 * none; `onOpen` is always given one, so only the `section` form can be absent.
 */
export function LearnMore({ section, topic, onOpen }: LearnMoreProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const hosts = useHelpPanel((state) => state.hosts);
  const show = useHelpPanel((state) => state.show);

  if (onOpen === undefined && hosts === 0) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={t('help.learnMore.label', { topic })}
      className="inline-flex min-h-touch items-center self-start text-ui-sm underline underline-offset-4 md:min-h-0"
      onClick={() => {
        (onOpen ?? (() => show(section)))();
      }}
    >
      {t('help.learnMore.action')}
    </button>
  );
}
