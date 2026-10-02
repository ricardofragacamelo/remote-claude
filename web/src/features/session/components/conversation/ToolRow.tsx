import { useState } from 'react';
import {
  CircleCheck,
  CircleSlash,
  CircleX,
  LoaderCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { opensSubagent, toolLabel } from '../../lib/tool-labels';
import type { ToolExecution, ToolStatus } from '../../types/live-session';
import { AnsiText } from './AnsiText';
import { SubagentChildren } from './SubagentChildren';
import type { TimelineContext } from './timeline-context';
import { ToolDiffView } from './ToolDiffView';

/** The tools whose change the chat shows as a diff (plan 08, B-27). */
const DIFFABLE = new Set(['Edit', 'MultiEdit', 'Write']);

/** The icon of each state of a tool — beside its words, never instead of them (S-75). */
const STATUS_ICON: Readonly<Record<ToolStatus, LucideIcon>> = {
  running: LoaderCircle,
  succeeded: CircleCheck,
  failed: CircleX,
  denied: CircleSlash,
};

export interface ToolRowProps {
  readonly tool: ToolExecution;
  readonly context: TimelineContext;
}

/**
 * One tool, as **one line** — "Read src/x.ts", "Bash: pnpm test" — with its state by icon and by
 * word, the way the editor's extension shows it (plan 08, B-17). The line may cut what does not fit,
 * but the whole command is in its accessible name, and unfolding it shows the **exact** input,
 * never truncated (S-74). A subagent's tool unfolds into what the subagent said (B-21).
 *
 * A permission is never drawn like this: the card that asks is the queue's, whole (S-76).
 */
export function ToolRow({ tool, context }: ToolRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = toolLabel(tool, context.folder, context.taskList.absorbed);
  const text = t(label.key, label.params);
  const status = t(`session.toolStatus.${tool.status}`);
  const Icon = STATUS_ICON[tool.status];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('sessions.toolRow.label', { tool: text, status })}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-ui-sm hover:bg-accent"
      >
        <Chevron className="size-3.5 shrink-0" aria-hidden />
        <Icon
          className={
            tool.status === 'running' ? 'size-3.5 shrink-0 animate-spin' : 'size-3.5 shrink-0'
          }
          aria-hidden
        />
        <span className="truncate font-code">{text}</span>
        <span className="ml-auto shrink-0 text-ui-xs text-muted-foreground">
          {tool.status === 'running' && tool.elapsed !== null ? tool.elapsed : status}
        </span>
      </button>
      {DIFFABLE.has(tool.toolName) && tool.status === 'succeeded' && context.sessionId !== null && (
        <ToolDiffView tool={tool} sessionId={context.sessionId} folder={context.folder} />
      )}
      {open && <ToolDetails tool={tool} context={context} />}
    </li>
  );
}

/** The exact input, how it ended, what it said, the way to the trail — and a subagent's own words. */
function ToolDetails({ tool, context }: ToolRowProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="ml-5 flex flex-col gap-2 border-l border-border pl-2">
      <pre
        className="max-h-64 overflow-auto rounded bg-muted p-2 font-code text-ui-xs whitespace-pre-wrap"
        aria-label={t('sessions.toolRow.input')}
      >
        {JSON.stringify(tool.input, null, 2)}
      </pre>
      {tool.status === 'denied' && (
        <p className="text-ui-xs text-destructive">
          {t('sessions.toolRow.denied', { reason: tool.summary ?? '' })}
        </p>
      )}
      {tool.status !== 'denied' && tool.summary !== null && tool.summary !== '' && (
        <AnsiText output={tool.summary} />
      )}
      {opensSubagent(tool.toolName) && <SubagentChildren tool={tool} context={context} />}
      {context.sessionId !== null && (
        <Link
          to="/audit"
          search={{ sessionId: context.sessionId, toolName: tool.toolName }}
          className="self-start text-ui-xs underline underline-offset-4"
        >
          {t('sessions.toolRow.trail')}
        </Link>
      )}
    </div>
  );
}
