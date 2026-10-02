import { useTranslation } from 'react-i18next';

import { HelpPanel } from '@/shared/components/HelpPanel';
import type { HelpExtra, ScreenShortcut } from '@/shared/components/HelpPanel';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/components/ui/sheet';

export interface HelpDrawerProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** Where it comes from: the bottom on a phone, the right over the workbench. */
  readonly side: 'bottom' | 'right';

  /** The id a control that opens it names in `aria-controls`. */
  readonly id?: string;

  /** The screen's name and what it is for, translated. */
  readonly title: string;
  readonly purpose: string;

  /** The prefix of the help keys: `<help>.what`, `<help>.states`, `<help>.notRecorded`. */
  readonly help: string;
  readonly shortcuts: readonly ScreenShortcut[];
  readonly headingId: string;

  /** Parts of the screen's own, after the written ones. */
  readonly extra?: readonly HelpExtra[];
}

/**
 * A screen's help as a sheet over it — the screen frame's under `md`, and the workbench's always.
 *
 * The sheet itself takes the focus, not its first button: a focused button shows its tooltip, and
 * the first `Esc` would close the tooltip instead of the help.
 */
export function HelpDrawer({
  open,
  onOpenChange,
  side,
  id,
  title,
  purpose,
  help,
  shortcuts,
  headingId,
  extra,
}: HelpDrawerProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={id}
        side={side}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <SheetTitle className="sr-only">{t('help.panel.title', { screen: title })}</SheetTitle>
        <SheetDescription className="sr-only">{purpose}</SheetDescription>
        <HelpPanel
          title={title}
          help={help}
          shortcuts={shortcuts}
          headingId={headingId}
          {...(extra === undefined ? {} : { extra })}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
