import { CircleDashed, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { CONTEXT_WARNING_PERCENT, useContextUse } from '../../hooks/useSessionInsight';
import type { ContextUse } from '../../types/insight';

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

/** The place the meter takes in the bar — the same whether it shows, loads or steps aside (S-34). */
const SLOT = 'inline-flex h-touch min-w-12 shrink-0 items-center justify-center md:h-7';

/** The radius of the ring, and the length of its whole circle. */
const RADIUS = 6;
const CIRCLE = 2 * Math.PI * RADIUS;

export interface ContextMeterProps {
  readonly sessionId: string;

  /** Sends `/compact` as a prompt — the installation's own command, by the normal way (B-37). */
  onCompact(): void;
}

/**
 * How full the conversation's context window is (plan 08, B-37), in the composer bar (plan 09,
 * B-13): a small ring with the share used, and — a click away, opening upwards — the categories,
 * the warning near the limit and the way to compact. A use that cannot be read is not a failure of
 * the panel: the ring steps aside with the reason in its tooltip, and keeps its place, so nothing
 * else in the bar moves (S-34).
 */
export function ContextMeter({ sessionId, onCompact }: ContextMeterProps): React.JSX.Element {
  const { t } = useTranslation();
  const loaded = useContextUse(sessionId);
  const use = loaded.data;

  if (use !== null) {
    return <Ring use={use} onCompact={onCompact} />;
  }

  if (loaded.error === null) {
    return <span className={SLOT} aria-hidden />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          className={cn(SLOT, 'text-muted-foreground')}
          aria-label={t('sessions.context.unavailable')}
        >
          <CircleDashed className="size-3.5" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t('sessions.context.unavailable')} {t(loaded.error.messageKey, loaded.error.params)}
      </TooltipContent>
    </Tooltip>
  );
}

/** The ring, and what it opens. */
function Ring({
  use,
  onCompact,
}: {
  readonly use: ContextUse;
  onCompact(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const near = use.percentage >= CONTEXT_WARNING_PERCENT;
  const label = t('sessions.context.label', { percentage: use.percentage });
  const filled = (Math.min(100, Math.max(0, use.percentage)) / 100) * CIRCLE;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            SLOT,
            'gap-1 rounded-md px-1 text-ui-xs hover:bg-accent',
            near && 'text-warning',
          )}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3.5 -rotate-90"
            role="meter"
            aria-label={label}
            aria-valuenow={use.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <circle cx="8" cy="8" r={RADIUS} fill="none" strokeWidth="2" className="stroke-muted" />
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              strokeWidth="2"
              strokeDasharray={`${String(filled)} ${String(CIRCLE)}`}
              className={near ? 'stroke-warning' : 'stroke-primary'}
            />
          </svg>
          <span>{t('sessions.context.percentage', { percentage: use.percentage })}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        className="flex w-72 flex-col gap-2 p-2 text-ui-sm"
      >
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
        <DropdownMenuItem onSelect={onCompact}>
          <Minimize2 className="size-4" aria-hidden />
          {t('sessions.context.compact')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
