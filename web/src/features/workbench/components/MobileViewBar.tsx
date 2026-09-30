import { FileCode, Files, MessageSquare, PanelBottom } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { MOBILE_VIEWS } from '../types/workbench';
import type { MobileView } from '../types/workbench';

const ICONS: Readonly<Record<MobileView, LucideIcon>> = {
  explorer: Files,
  editor: FileCode,
  claude: MessageSquare,
  panel: PanelBottom,
};

/** The keys of the labels, named in full so the i18n check sees each one. */
const LABELS: Readonly<Record<MobileView, string>> = {
  explorer: 'workbench.mobile.explorer',
  editor: 'workbench.mobile.editor',
  claude: 'workbench.mobile.claude',
  panel: 'workbench.mobile.panel',
};

export interface MobileViewBarProps {
  readonly view: MobileView;
  onPick(view: MobileView): void;
}

/**
 * Under `md`, the bar at the bottom that puts one view of the folder tab on screen at a time —
 * Explorer, Editor, Claude, Panel — all of them still **inside the same tab**
 * ([06 · D-08](../../../../../docs/plans/06-workbench/decisions.md#d-08--o-workbench-em-tela-pequena)).
 * Each target is at least 44 × 44 px.
 */
export function MobileViewBar({ view, onPick }: MobileViewBarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('workbench.mobile.label')}
      className="grid shrink-0 grid-cols-4 border-t border-border bg-sidebar"
    >
      {MOBILE_VIEWS.map((each) => {
        const Icon = ICONS[each];

        return (
          <button
            key={each}
            type="button"
            aria-pressed={each === view}
            className={cn(
              'flex min-h-touch flex-col items-center justify-center gap-0.5 text-ui-sm',
              each === view ? 'text-foreground' : 'text-muted-foreground',
            )}
            onClick={() => {
              onPick(each);
            }}
          >
            <Icon className="size-5" aria-hidden />
            {t(LABELS[each])}
          </button>
        );
      })}
    </nav>
  );
}
