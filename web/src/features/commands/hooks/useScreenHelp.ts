import { useTranslation } from 'react-i18next';

import type { ScreenShortcut } from '@/shared/components/HelpPanel';
import { useScreenShortcuts } from './useShortcut';

/** What every screen's own help needs before its four fixed parts — read once, never twice. */
export interface ScreenHelpBasics {
  readonly title: string;
  readonly purpose: string;
  readonly shortcuts: readonly ScreenShortcut[];
}

/**
 * The title, purpose and shortcuts a screen's own `HelpSheet`/`ScreenFrame` starts from — every
 * screen's help reads the same three this way, so a screen's own component is only ever its
 * `extra` parts (docs/architecture/web/03-ui-system.md#moldura-de-tela).
 */
export function useScreenHelpBasics(
  titleKey: string,
  purposeKey: string,
  shortcutIds: readonly string[],
): ScreenHelpBasics {
  const { t } = useTranslation();
  const shortcuts = useScreenShortcuts(shortcutIds);

  return { title: t(titleKey), purpose: t(purposeKey), shortcuts };
}
