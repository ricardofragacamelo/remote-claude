import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Menu, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth';
import { afterClose, FileMenu } from '@/features/commands';
import { useWorkbenchTarget } from '@/features/workbench';
import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { useVisualViewport } from '@/shared/hooks/useVisualViewport';
import { cn } from '@/shared/lib/utils';
import { AccountMenu } from './AccountMenu';
import { RailMenuTrigger } from './RailMenuTrigger';
import { activeEntry, globalNavigation, manageMenu } from './global-navigation';
import type { ManageEntry, NavigationEntry } from './global-navigation';

export interface AppFrameProps {
  readonly children: ReactNode;
}

/** One link of the navigation, resolved: where it goes and whether it is where the person is. */
interface ResolvedEntry {
  readonly entry: NavigationEntry;
  readonly href: string;
  readonly current: boolean;
}

/**
 * The entries of the navigation, resolved against where the person is.
 *
 * "Workbench" leads to the active folder tab when there is one — the welcome screen otherwise
 * ([06 · D-25](../../../docs/plans/06-workbench/decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)).
 */
function useNavigationEntries(): readonly ResolvedEntry[] {
  const { isAuthenticated } = useAuth();
  const entries = useRegistry(globalNavigation);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workbenchFolder = useWorkbenchTarget(isAuthenticated);
  const active = activeEntry(entries, pathname);

  return entries.map((entry) => ({
    entry,
    href: entry.href({ workbenchFolder }),
    current: entry === active,
  }));
}

/**
 * The frame every screen lives in: the global navigation — one screen per subject — and, at its
 * foot, the "manage" menu and the account (docs/architecture/web/03-ui-system.md#a-moldura-do-app).
 *
 * A rail at the left from `md` up, with the File menu across the top; below it, a bar at the top
 * whose menu opens the navigation — and the File menu — in a sheet that holds the focus and closes
 * on `Esc` (plan 06, S-92, S-129).
 */
export function AppFrame({ children }: AppFrameProps): React.JSX.Element {
  const desktop = useIsDesktop();
  const { isAuthenticated } = useAuth();
  useVisualViewport(!desktop);

  return desktop ? (
    <div className="flex h-dvh min-h-0 bg-background text-foreground">
      <Rail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isAuthenticated && (
          <header className="flex h-8 shrink-0 items-center border-b border-border bg-sidebar px-1">
            <FileMenu />
          </header>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  ) : (
    <div className="flex h-[var(--app-height,100dvh)] min-h-0 flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

/** Follows a link inside the app without reloading it — unless the person asked for a new tab. */
function useFollow(): (event: MouseEvent<HTMLAnchorElement>, href: string) => void {
  const navigate = useNavigate();

  return (event, href) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    void navigate({ href });
  };
}

/** The navigation down the left edge, icons with a tooltip each. */
function Rail(): React.JSX.Element {
  const { t } = useTranslation();
  const entries = useNavigationEntries();
  const follow = useFollow();

  return (
    <nav
      aria-label={t('navigation.global.label')}
      className="flex w-rail shrink-0 flex-col items-center justify-between border-r border-border bg-activitybar py-1 text-activitybar-foreground"
    >
      <ul className="flex flex-col items-center gap-1">
        {entries.map(({ entry, href, current }) => (
          <li key={entry.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={href}
                  aria-label={t(entry.labelKey)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'relative flex size-12 items-center justify-center rounded-md hover:text-foreground',
                    current &&
                      'text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-primary',
                  )}
                  onClick={(event) => {
                    follow(event, href);
                  }}
                >
                  <entry.icon className="size-5" aria-hidden />
                  {entry.Badge !== undefined && (
                    <span className="absolute right-1 bottom-1">
                      <entry.Badge />
                    </span>
                  )}
                </a>
              </TooltipTrigger>
              <TooltipContent side="right">{t(entry.labelKey)}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-1">
        <ManageMenu />
        <AccountMenu compact />
      </div>
    </nav>
  );
}

/** Under `md`: the bar at the top, and the navigation in a sheet behind its menu. */
function TopBar(): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const entries = useNavigationEntries();
  const follow = useFollow();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-1">
      <IconButton
        icon={Menu}
        label={t('navigation.menu.open')}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      />
      <span className="text-ui font-ui-strong">{t('navigation.bar.appName')}</span>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetTitle>{t('navigation.global.label')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('navigation.menu.description')}
          </SheetDescription>
          <nav
            aria-label={t('navigation.global.label')}
            className="flex flex-1 flex-col justify-between gap-4"
          >
            <FileMenu
              className="border-b border-border pb-2"
              onPick={() => {
                setOpen(false);
              }}
            />
            <ul className="flex flex-1 flex-col gap-1">
              {entries.map(({ entry, href, current }) => (
                <li key={entry.id}>
                  <a
                    href={href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-touch items-center gap-3 rounded-md px-3 text-ui hover:bg-accent',
                      current && 'bg-accent text-accent-foreground',
                    )}
                    onClick={(event) => {
                      follow(event, href);
                      setOpen(false);
                    }}
                  >
                    <entry.icon className="size-5" aria-hidden />
                    {t(entry.labelKey)}
                    {entry.Badge !== undefined && <entry.Badge />}
                  </a>
                </li>
              ))}
            </ul>
            <AccountMenu compact={false} />
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

/**
 * The "manage" menu — the gear of the editor people know: the palette, Settings, About. What nobody
 * registered does not show, and a menu with nothing in it does not show at all.
 */
function ManageMenu(): React.JSX.Element | null {
  const { t } = useTranslation();
  const entries = useRegistry(manageMenu);
  const navigate = useNavigate();

  if (entries.length === 0) {
    return null;
  }

  // After the menu has closed and given the focus back: the palette it may open remembers that place.
  const pick = (entry: ManageEntry): void => {
    afterClose(() => {
      entry.run?.();
      if (entry.href !== undefined) {
        void navigate({ href: entry.href });
      }
    });
  };

  return (
    <DropdownMenu>
      <RailMenuTrigger
        label={t('navigation.manage.label')}
        icon={Settings}
        className="size-12 justify-center hover:text-foreground"
      />
      <DropdownMenuContent side="right" align="end">
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            onSelect={() => {
              pick(entry);
            }}
          >
            <entry.icon className="size-4" aria-hidden />
            {t(entry.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
