import { useState } from 'react';
import { CircleUser, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import { RailMenuTrigger } from './RailMenuTrigger';

export interface AccountMenuProps {
  /** Where it opens from: the rail from `md` up, the sheet of the menu below it. */
  readonly compact: boolean;
}

/**
 * Who is signed in, and the way out — at the foot of the navigation, as the editor people know has
 * it. Signing out runs once, whatever the number of clicks: the second would hit a cookie the first
 * already dropped.
 */
export function AccountMenu({ compact }: AccountMenuProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { isAuthenticated, displayName, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const label = t('navigation.account.label');

  return (
    <DropdownMenu>
      <RailMenuTrigger
        label={label}
        icon={CircleUser}
        className={cn(
          'hover:bg-accent hover:text-accent-foreground',
          compact ? 'size-touch justify-center md:size-12' : 'min-h-touch w-full px-3',
        )}
      >
        {!compact && <span className="truncate">{displayName}</span>}
      </RailMenuTrigger>
      <DropdownMenuContent side={compact ? 'right' : 'top'} align="end">
        <DropdownMenuLabel>
          {t('navigation.account.signedInAs', { name: displayName })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={leaving}
          onSelect={() => {
            setLeaving(true);
            void logout().finally(() => {
              setLeaving(false);
            });
          }}
        >
          <LogOut className="size-4" aria-hidden />
          {t('auth.signOut.action')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
