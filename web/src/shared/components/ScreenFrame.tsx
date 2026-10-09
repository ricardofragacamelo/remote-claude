import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { HelpDrawer } from '@/shared/components/HelpDrawer';
import { HelpPanel } from '@/shared/components/HelpPanel';
import type { HelpExtra, ScreenShortcut } from '@/shared/components/HelpPanel';
import { IconButton } from '@/shared/components/IconButton';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';

export interface ScreenFrameProps {
  /** Already translated. */
  readonly title: string;

  /** What the screen is for, in one line — "what ran on your machine without asking". Translated. */
  readonly purpose: string;

  /**
   * The prefix of the screen's help: `<help>.what`, `<help>.states` and `<help>.notRecorded` have to
   * exist in `en` and `pt-BR`, and the i18n check fails the build when one does not (plan 06, S-94).
   * A literal, so the check can read it.
   */
  readonly help: string;

  /** The screen's shortcuts, for the help to list — never repeated by hand elsewhere. */
  readonly shortcuts?: readonly ScreenShortcut[];

  /** The screen's own actions, at the right of the heading. */
  readonly actions?: ReactNode;

  /** Parts of the help of its own, after the three written ones — what a "learn more" opens. */
  readonly extra?: readonly HelpExtra[];

  readonly children: ReactNode;
}

/**
 * The frame of every screen outside the workbench: a heading with the purpose in one line, the
 * screen's actions, and a help panel that says what the screen is, what each state means, what it
 * does **not** show or record, and its shortcuts.
 *
 * It is what makes the screens a family instead of loose pages, and what keeps each plan after this
 * one from inventing its own heading (docs/architecture/web/03-ui-system.md#moldura-de-tela). The
 * help is a drawer at the right from `md` up, and a sheet from the bottom below it.
 */
export function ScreenFrame({
  title,
  purpose,
  help,
  shortcuts = [],
  actions,
  extra,
  children,
}: ScreenFrameProps): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const open = useHelpPanel((state) => state.open);
  const setOpen = useHelpPanel((state) => state.setOpen);
  const attach = useHelpPanel((state) => state.attach);
  const headingId = useId();
  const panelId = useId();
  // What the panel and the drawer both show: the same help, in either place.
  const helpProps = {
    help,
    shortcuts,
    headingId: `${headingId}-help`,
    ...(extra === undefined ? {} : { extra }),
  };

  // While a screen with a help is on screen, the palette and its shortcut can open it.
  useEffect(() => attach(), [attach]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 id={headingId} className="text-lg font-ui-strong">
              {title}
            </h1>
            <p className="text-ui text-muted-foreground">{purpose}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <IconButton
              icon={CircleHelp}
              label={t('help.panel.open')}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => {
                setOpen(!open);
              }}
            />
          </div>
        </header>
        <div className="flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">{children}</div>
      </div>

      {desktop ? (
        open && (
          <aside
            id={panelId}
            aria-labelledby={`${headingId}-help`}
            className="w-80 shrink-0 overflow-y-auto border-l border-border bg-sidebar p-4 text-sidebar-foreground"
          >
            <HelpPanel title={title} {...helpProps} />
          </aside>
        )
      ) : (
        <HelpDrawer
          open={open}
          onOpenChange={setOpen}
          side="bottom"
          id={panelId}
          title={title}
          purpose={purpose}
          {...helpProps}
        />
      )}
    </div>
  );
}
