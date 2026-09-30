import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { IconButton } from '@/shared/components/IconButton';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { workbenchViews } from '../store/registries';

export interface ActivityBarProps {
  /** The view of the side bar, and whether the side bar is open at all. */
  readonly view: string;
  readonly sideBarOpen: boolean;
  onPick(view: string): void;

  /** Down the left edge from `md` up; across the top of the Explorer view below it. */
  readonly orientation?: 'vertical' | 'horizontal';
}

/**
 * The views of the folder, in the order their plans declared them.
 *
 * The one showing is pressed; pressing it again closes the side bar (plan 06, S-111).
 */
export function ActivityBar({
  view,
  sideBarOpen,
  onPick,
  orientation = 'vertical',
}: ActivityBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const views = useRegistry(workbenchViews);

  return (
    <div
      role="toolbar"
      aria-orientation={orientation}
      aria-label={t('workbench.activityBar.label')}
      className={cn(
        'flex shrink-0 items-center gap-1 bg-activitybar p-1 text-activitybar-foreground',
        orientation === 'vertical' ? 'w-rail flex-col' : 'border-b border-border',
      )}
    >
      {views.map((entry) => (
        <IconButton
          key={entry.id}
          size="rail"
          icon={entry.icon}
          label={t(entry.labelKey)}
          aria-pressed={sideBarOpen && entry.id === view}
          onClick={() => {
            onPick(entry.id);
          }}
        />
      ))}
    </div>
  );
}
