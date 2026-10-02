import { useState } from 'react';
import { ChevronRight, CornerLeftUp, FileText, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { folderName } from '@/shared/lib/folder-name';
import { openFile } from '../hooks/tabs';
import { useDirectory } from '../hooks/useDirectory';
import { crumbsOf, parentOf } from '../lib/paths';

export interface BreadcrumbProps {
  readonly folder: string;

  /** The file of the tab on screen, relative to the folder. */
  readonly path: string;

  /** The place of the group it is above — what tells two trails apart. */
  readonly place: number;
}

/**
 * The way to the file on screen, above the editor (S-220): the folder, then each directory. Each step
 * opens the list of what is beside it; a directory there goes into it, a file opens.
 */
export function Breadcrumb({ folder, path, place }: BreadcrumbProps): React.JSX.Element {
  const { t } = useTranslation();
  const crumbs = [{ name: folderName(folder), directory: null }, ...crumbsOf(path)];

  return (
    <nav
      aria-label={t('editor.breadcrumb.label', { place })}
      className="shrink-0 border-b border-border"
    >
      <ol className="flex min-w-0 items-center overflow-x-auto px-2 text-ui-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${String(index)}:${crumb.name}`} className="flex shrink-0 items-center">
            {index > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            {crumb.directory === null ? (
              <span className="px-1">{crumb.name}</span>
            ) : (
              <CrumbMenu folder={folder} name={crumb.name} directory={crumb.directory} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface CrumbMenuProps {
  readonly folder: string;
  readonly name: string;

  /** The directory the step is in — what its list shows first. */
  readonly directory: string;
}

function CrumbMenu({ folder, name, directory }: CrumbMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(directory);
  const listing = useDirectory(folder, browsing, open);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setBrowsing(directory);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('editor.breadcrumb.step', { name })}
          className="min-h-touch rounded-sm px-1 hover:bg-accent hover:text-accent-foreground md:min-h-6"
        >
          {name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="font-code">
          {browsing === '' ? folderName(folder) : browsing}
        </DropdownMenuLabel>
        {browsing !== '' && (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setBrowsing(parentOf(browsing));
            }}
          >
            <CornerLeftUp className="size-4" aria-hidden />
            {t('editor.breadcrumb.up')}
          </DropdownMenuItem>
        )}
        {listing.isLoading && (
          <DropdownMenuItem disabled>{t('editor.breadcrumb.loading')}</DropdownMenuItem>
        )}
        {listing.error !== null && (
          <DropdownMenuItem disabled>
            {t(listing.error.messageKey, listing.error.params)}
          </DropdownMenuItem>
        )}
        {listing.entries.map((entry) => (
          <DropdownMenuItem
            key={entry.path}
            onSelect={(event) => {
              if (entry.kind === 'directory') {
                event.preventDefault();
                setBrowsing(entry.path);
              } else {
                openFile(folder, entry.path);
              }
            }}
          >
            {entry.kind === 'directory' ? (
              <Folder className="size-4" aria-hidden />
            ) : (
              <FileText className="size-4" aria-hidden />
            )}
            {entry.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
