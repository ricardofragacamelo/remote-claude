import { AlertTriangle, Circle, Folder, Languages, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useConnectionStatus } from '@/shared/hooks/useConnectionStatus';
import { useLocale } from '@/shared/hooks/useLocale';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { useTheme } from '@/shared/hooks/useTheme';
import { LOCALES } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';
import { useCopy } from '@/shared/hooks/useCopy';
import { statusBarItems } from '../store/registries';
import type { StatusItemEntry, StatusItemProps } from '../types/workbench';

/** The shell's own items: the folder at the left, the app's at the right. */
const OWN_ITEMS: readonly StatusItemEntry[] = [
  { id: 'folder', side: 'left', position: 100, component: FolderItem },
  { id: 'connection', side: 'right', position: 100, component: ConnectionItem },
  { id: 'language', side: 'right', position: 200, component: LanguageItem },
  { id: 'theme', side: 'right', position: 300, component: ThemeItem },
];

/** The names of the languages, each in itself — named in full so the i18n check sees each one. */
const LANGUAGE_NAMES = { en: 'status.language.en', 'pt-BR': 'status.language.ptBR' } as const;

function sideOf(
  items: readonly StatusItemEntry[],
  side: StatusItemEntry['side'],
): readonly StatusItemEntry[] {
  return items
    .filter((item) => item.side === side)
    .sort((left, right) => left.position - right.position);
}

/**
 * The status bar: what is true about the folder of the tab at the left, and about the app at the
 * right — the connection (and the moment it drops), the language, the theme. Anybody else puts an
 * item here by registering it (plan 06, S-114).
 */
export function StatusBar({ tab }: StatusItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const items = [...OWN_ITEMS, ...useRegistry(statusBarItems)];

  return (
    <footer
      aria-label={t('status.bar.label')}
      className="flex h-touch shrink-0 items-center justify-between gap-2 bg-statusbar px-2 text-ui-sm text-statusbar-foreground md:h-statusbar"
    >
      <Side items={sideOf(items, 'left')} tab={tab} className="min-w-0 flex-1 overflow-x-auto" />
      <Side items={sideOf(items, 'right')} tab={tab} className="min-w-0 overflow-x-auto" />
    </footer>
  );
}

/**
 * One side of the bar. Each scrolls within itself when the bar is narrow — on a phone, once a session
 * puts its status and its changes at the left and the editor its position and language at the right —
 * so the page never does (plan 08, S-268; 07, S-288). The folder's side gives way first: the app's
 * keeps the width of what it holds while it fits.
 */
function Side({
  items,
  tab,
  className,
}: StatusItemProps & {
  readonly items: readonly StatusItemEntry[];
  readonly className: string;
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {items.map((item) => {
        const Item: ComponentType<StatusItemProps> = item.component;
        return <Item key={item.id} tab={tab} />;
      })}
    </div>
  );
}

/** The folder of the tab — and, when the server no longer lets it be used, why. A press copies its path. */
function FolderItem({ tab }: StatusItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { state, copy } = useCopy();
  const unavailable = tab.state !== 'available';
  const Icon = unavailable ? AlertTriangle : Folder;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t('status.folder.label', { path: tab.path })}
          className="flex min-h-touch min-w-0 items-center gap-1 rounded-sm px-1 hover:bg-statusbar-foreground/10 md:min-h-0"
          onClick={() => {
            copy(tab.path);
          }}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{tab.name}</span>
          {unavailable && <span>{t(`status.folderState.${tab.state}`)}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-code">{tab.path}</span>
        {state !== 'idle' && <span>{t(`status.folderCopy.${state}`)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Where the socket stands — and the moment it drops, said, not hidden. */
function ConnectionItem(): React.JSX.Element {
  const { t } = useTranslation();
  const status = useConnectionStatus();

  return (
    <span role="status" className="flex items-center gap-1 px-1">
      <Circle
        className={cn('size-2.5', status === 'ready' ? 'fill-current' : 'opacity-60')}
        aria-hidden
      />
      {t(`connection.status.${status}`)}
    </span>
  );
}

/** The language of the interface, and the way to pick another. */
function LanguageItem(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useLocale((state) => state.locale);
  const setLocale = useLocale((state) => state.setLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('status.language.pick', { language: t(LANGUAGE_NAMES[locale]) })}
          className="flex min-h-touch items-center gap-1 rounded-sm px-1 hover:bg-statusbar-foreground/10 md:min-h-0"
        >
          <Languages className="size-3.5" aria-hidden />
          {t(LANGUAGE_NAMES[locale])}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('status.language.title')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          // The only values are the items below, one per language this build has.
          onValueChange={(value) => {
            setLocale(value as Locale);
          }}
        >
          {LOCALES.map((each) => (
            <DropdownMenuRadioItem key={each} value={each}>
              {t(LANGUAGE_NAMES[each])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The theme — one press to the other one. */
function ThemeItem(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme((state) => state.theme);
  const toggle = useTheme((state) => state.toggle);

  return (
    <IconButton
      icon={theme === 'dark' ? Moon : Sun}
      label={theme === 'dark' ? t('status.theme.toLight') : t('status.theme.toDark')}
      className="md:size-6"
      onClick={toggle}
    />
  );
}
