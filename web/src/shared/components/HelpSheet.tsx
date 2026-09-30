import { useEffect, useId, useState } from 'react';

import { HelpDrawer } from '@/shared/components/HelpDrawer';
import type { ScreenShortcut } from '@/shared/components/HelpPanel';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';

export interface HelpSheetProps {
  /** The screen's name, translated. */
  readonly title: string;

  /** What the screen is for, in one line. Translated. */
  readonly purpose: string;

  /**
   * The prefix of the help: `<help>.what`, `<help>.states` and `<help>.notRecorded` have to exist in
   * `en` and `pt-BR` — the i18n check reads this literal as it reads a screen frame's (plan 06, S-94).
   */
  readonly help: string;
  readonly shortcuts: readonly ScreenShortcut[];
}

/**
 * The help of a screen that has no screen frame — the workbench, whose every pixel belongs to the
 * folder tab: the same four parts, in a sheet over it (at the right from `md` up, from the bottom
 * below), opened by its button, by `Shift+F1`, or by a "learn more".
 *
 * It opens on a **request** made while it is on screen, never because the help was left open on
 * another screen: a sheet that covered the tab the moment it opened would be in the way of the work.
 */
export function HelpSheet({ title, purpose, help, shortcuts }: HelpSheetProps): React.JSX.Element {
  const desktop = useIsDesktop();
  const attach = useHelpPanel((state) => state.attach);
  const setOpen = useHelpPanel((state) => state.setOpen);
  const globalOpen = useHelpPanel((state) => state.open);
  const requested = useHelpPanel((state) => state.requested);
  const [atMount] = useState(() => useHelpPanel.getState().requested);
  const headingId = useId();

  // While it is on screen, the palette, the shortcut and a "learn more" can open it.
  useEffect(() => attach(), [attach]);

  return (
    <HelpDrawer
      open={globalOpen && requested > atMount}
      onOpenChange={setOpen}
      side={desktop ? 'right' : 'bottom'}
      title={title}
      purpose={purpose}
      help={help}
      shortcuts={shortcuts}
      headingId={headingId}
    />
  );
}
