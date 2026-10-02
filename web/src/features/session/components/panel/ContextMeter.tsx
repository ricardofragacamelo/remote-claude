import { Gauge, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { CONTEXT_WARNING_PERCENT, useContextUse } from '../../hooks/useSessionInsight';

/** The words of the categories this build knows — named in full; any other shows its own name. */
const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  systemPrompt: 'sessions.context.systemPrompt',
  systemTools: 'sessions.context.systemTools',
  mcpTools: 'sessions.context.mcpTools',
  messages: 'sessions.context.messages',
  memoryFiles: 'sessions.context.memoryFiles',
  skills: 'sessions.context.skills',
  freeSpace: 'sessions.context.freeSpace',
  autocompactBuffer: 'sessions.context.buffer',
};

export interface ContextMeterProps {
  readonly sessionId: string;

  /** Sends `/compact` as a prompt — the installation's own command, by the normal way (B-37). */
  onCompact(): void;
}

/**
 * How full the conversation's context window is (plan 08, B-37): a compact bar, the categories a
 * click away, a warning near the limit and the way to compact. A use that cannot be read is not a
 * failure of the panel: the meter steps aside, with the reason in its tooltip (S-175).
 */
export function ContextMeter({
  sessionId,
  onCompact,
}: ContextMeterProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const loaded = useContextUse(sessionId);
  const use = loaded.data;

  if (use === null) {
    return loaded.error === null ? null : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            className="inline-flex text-muted-foreground"
            aria-label={t('sessions.context.unavailable')}
          >
            <Gauge className="size-4" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t('sessions.context.unavailable')} {t(loaded.error.messageKey, loaded.error.params)}
        </TooltipContent>
      </Tooltip>
    );
  }

  const near = use.percentage >= CONTEXT_WARNING_PERCENT;
  const label = t('sessions.context.label', { percentage: use.percentage });

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex items-center gap-1 rounded px-1 hover:bg-accent"
          >
            <Gauge className={cn('size-4', near && 'text-warning')} aria-hidden />
            <span
              className="h-1.5 w-16 overflow-hidden rounded bg-muted"
              role="meter"
              aria-label={label}
              aria-valuenow={use.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className={cn('block h-full', near ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${String(Math.min(100, use.percentage))}%` }}
              />
            </span>
            <span className="text-ui-xs">
              {t('sessions.context.percentage', { percentage: use.percentage })}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="flex w-72 flex-col gap-2 p-2 text-ui-sm">
          <p className="font-ui-strong">{label}</p>
          <p className="text-ui-xs text-muted-foreground">
            {t('sessions.context.window', { total: use.totalTokens, max: use.maxTokens })}
          </p>
          <ul className="flex flex-col gap-0.5">
            {use.categories.map((category) => (
              <li key={category.id} className="flex justify-between gap-2">
                <span>
                  {CATEGORY_NAMES[category.id] === undefined
                    ? category.name
                    : t(CATEGORY_NAMES[category.id] ?? '')}
                </span>
                <span className="font-code text-ui-xs">
                  {t('sessions.context.tokens', { tokens: category.tokens })}
                </span>
              </li>
            ))}
          </ul>
          {near && (
            <p role="note" className="text-warning">
              {t('sessions.context.near')}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton icon={Minimize2} label={t('sessions.context.compact')} onClick={onCompact} />
    </div>
  );
}
