import { useTranslation } from 'react-i18next';

import type { ViewEntry } from '../types/workbench';
import { ViewPlaceholder } from './ViewPlaceholder';

export interface SideBarProps {
  readonly folder: string;
  readonly view: ViewEntry;
}

/**
 * The view the activity bar picked — the component its plan registered, or, while the place is only
 * held, what will live there.
 */
export function SideBar({ folder, view }: SideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const View = view.component;
  const label = t(view.labelKey);

  return (
    <aside
      aria-label={label}
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <h2 className="flex h-header shrink-0 items-center px-3 text-ui-sm font-ui-strong tracking-wide uppercase">
        {label}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {View === undefined ? (
          <ViewPlaceholder icon={view.icon} title={label} description={t(view.placeholderKey)} />
        ) : (
          <View folder={folder} />
        )}
      </div>
    </aside>
  );
}
