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
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { formatBytes } from '@/features/editor';
import { AnsweredQuestions, PermissionOutcomeLine } from '@/features/permission';
import { Button } from '@/shared/components/ui/button';
import { changesFileText, commandOf } from '@/shared/lib/tool-call';
import { toolLine } from '@/shared/lib/tool-label';
import type { ToolLine as ToolLineText } from '@/shared/lib/tool-label';
import { useToolResult } from '../../hooks/useToolResult';
import type { ToolOutput, ToolResult } from '../../hooks/useToolResult';
import type { ToolExecution, ToolStatus } from '../../types/live-session';
import { AnsiText } from './AnsiText';
import { ScrollingPre } from './ScrollingPre';
import { SubagentChildren } from './SubagentChildren';
import type { TimelineContext } from './timeline-context';
import { ToolDiffView } from './ToolDiffView';
import { questionOf } from './question-of';
import type { QuestionView } from './question-of';

/** The icon of each state of a tool — beside its words, never instead of them (S-75). */
const STATUS_ICON: Readonly<Record<ToolStatus, LucideIcon>> = {
  running: LoaderCircle,
  succeeded: CircleCheck,
  failed: CircleX,
  denied: CircleSlash,
};

/** How long a tool has run, while it runs and the engine said — `null` otherwise. */
function runningFor(tool: ToolExecution): string | null {
  return tool.status === 'running' ? tool.elapsed : null;
}

/**
 * Whether the whole output of a tool can be asked for: it finished — a tool still running has no
 * result yet (S-116), and a refused one has only the refusal — and it is of the main conversation,
 * the only chain the route reads (plan 22, S-28).
 */
function hasResult(tool: ToolExecution): boolean {
  return (tool.status === 'succeeded' || tool.status === 'failed') && tool.parentToolUseId === null;
}

/**
 * The accessible name of the line: what it says, its state — and, under a title, the line it would
 * have without it, so the command is still read whole (plan 08, S-74; plan 22, B-29).
 */
function accessibleName(line: ToolLineText, status: string, t: TFunction): string {
  return line.detail === null
    ? t('sessions.toolRow.label', { tool: line.text, status })
    : t('sessions.toolRow.labelTitled', { tool: line.text, detail: line.detail, status });
}

export interface ToolRowProps {
  readonly tool: ToolExecution;
  readonly context: TimelineContext;
}

/**
 * One tool, as **one line** — "Read src/x.ts", "Shell: pnpm test" — with its state by icon and by
 * word, the way the editor's extension shows it (plan 08, B-17). The line is the label the server
 * built, translated (plan 28, B-18); it may cut what does not fit, but the whole command is in its
 * accessible name, and unfolding it shows the **exact** input, never truncated (S-74). A subagent's
 * tool unfolds into what the subagent said (B-21).
 *
 * A permission is never drawn like this: while it asks, the card stands in the place of this line,
 * whole (S-76, plan 09, B-23); once settled, the line comes back with the decision in words under it.
 */
export function ToolRow({ tool, context }: ToolRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const outcome = context.inline?.requests.settledByTool.get(tool.toolUseId);
  // A question of the agent is its questions and what was answered, open, in the place of the
  // generic input and output — and its decision is the answers, not "allowed by you" (plan 24,
  // B-15).
  const question = questionOf(tool, outcome);
  // The decision in words, under the line — a question says it with its answers instead.
  const decision = question === null ? outcome : undefined;
  // Open by default once it is a question — which, read from the history, it becomes only when its
  // end arrives — until the person folds or unfolds it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? question !== null;
  const { text, name, status } = lineOf(tool, question, t);
  // Here, and not in the details: the answer lives as long as the row, so folding it and unfolding
  // it again asks for nothing (S-113).
  const result = useToolResult(
    context.reference,
    tool.toolUseId,
    open && question === null && hasResult(tool),
  );

  return (
    <li className="flex flex-col gap-1">
      <ToolLine
        tool={tool}
        text={text}
        name={name}
        state={runningFor(tool) ?? status}
        open={open}
        onToggle={() => {
          setToggled(!open);
        }}
      />
      {decision !== undefined && <PermissionOutcomeLine outcome={decision} />}
      <DiffOf tool={tool} context={context} />
      {open && <ToolBody tool={tool} context={context} result={result} question={question} />}
    </li>
  );
}

/**
 * The diff of a call that changed a file and succeeded, under its line (plan 08, B-27) — by the files
 * it changes, never by the name of the tool (plan 28, B-18).
 */
function DiffOf({ tool, context }: ToolRowProps): React.JSX.Element | null {
  return changesFileText(tool.changes) &&
    tool.status === 'succeeded' &&
    context.sessionId !== null ? (
    <ToolDiffView
      toolUseId={tool.toolUseId}
      sessionId={context.sessionId}
      folder={context.folder}
    />
  ) : null;
}

/** What the line says, its state, and its accessible name. */
function lineOf(
  tool: ToolExecution,
  question: QuestionView | null,
  t: TFunction,
): { readonly text: string; readonly name: string; readonly status: string } {
  const line = toolLine(tool, t);
  const status = stateOf(tool, question, t);

  return { text: line.text, status, name: accessibleName(line, status, t) };
}

/** The row opened: the questions answered, or the input and what the tool said. */
function ToolBody({
  tool,
  context,
  result,
  question,
}: ToolRowProps & {
  readonly result: ToolResult;
  readonly question: QuestionView | null;
}): React.JSX.Element {
  return question === null ? (
    <ToolDetails tool={tool} context={context} result={result} />
  ) : (
    <div className="ml-5 border-l border-border pl-2">
      <AnsweredQuestions {...question} />
    </div>
  );
}

/**
 * The state of the line in words. A question still open says it waits for an answer — "running" is
 * not what a question does.
 */
function stateOf(tool: ToolExecution, question: QuestionView | null, t: TFunction): string {
  return tool.kind === 'question' && tool.status === 'running' && question === null
    ? t('permission.question.pending')
    : t(`session.toolStatus.${tool.status}`);
}

/** The line itself: the fold, the state by icon, what the tool is, and the state by word. */
function ToolLine({
  tool,
  text,
  name,
  state,
  open,
  onToggle,
}: {
  readonly tool: ToolExecution;
  readonly text: string;
  readonly name: string;
  readonly state: string;
  readonly open: boolean;
  onToggle(): void;
}): React.JSX.Element {
  const Icon = STATUS_ICON[tool.status];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={name}
      onClick={onToggle}
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
      <span className="ml-auto shrink-0 text-ui-xs text-muted-foreground">{state}</span>
    </button>
  );
}

/** One side of a shell call — what went in, what came out — under its tag, as the agent does. */
function Side({
  tag,
  label,
  children,
}: {
  readonly tag: string;
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section aria-label={label} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
      <span aria-hidden className="pt-2 font-code text-ui-xs text-muted-foreground">
        {tag}
      </span>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </section>
  );
}

/** The output with the place of the cut marked, when the route sent the start and the end only. */
function withCut(output: ToolOutput, marker: string): string {
  return output.cutAt === null
    ? output.text
    : `${output.text.slice(0, output.cutAt)}\n${marker}\n${output.text.slice(output.cutAt)}`;
}

/**
 * What a tool said: the end the timeline keeps (`summary`) until the whole output arrives — asked
 * for once, when the row unfolds (plan 22, B-29) —, then the whole of it. Cut by the server, it says
 * how large it was and marks where it was cut (S-114); not arrived, it keeps the end and says so,
 * with "try again" (S-115).
 */
function ToolOutputView({
  tool,
  result,
}: {
  readonly tool: ToolExecution;
  readonly result: ToolResult;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const { output } = result;
  const text = output === null ? tool.summary : withCut(output, t('sessions.toolRow.outputCut'));

  return (
    <>
      {text !== null && text !== '' && <AnsiText output={text} />}
      {result.isLoading && (
        <p role="status" className="text-ui-xs text-muted-foreground">
          {t('sessions.toolRow.outputLoading')}
        </p>
      )}
      {output?.truncated === true && (
        <p className="text-ui-xs text-muted-foreground">
          {t('sessions.toolRow.outputTruncated', {
            size: formatBytes(output.bytes, i18n.language),
          })}
        </p>
      )}
      {result.error !== null && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-ui-xs text-warning">
          <span>{t('sessions.toolRow.outputFailed')}</span>
          <Button variant="outline" onClick={result.retry}>
            {t('common.action.retry')}
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * The exact input of a call, whole, as JSON — the one view of it, whatever its kind: a kind this
 * build does not know is drawn here too, never an error (plan 28, S-56).
 */
function ExactInput({ tool }: { readonly tool: ToolExecution }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ScrollingPre label={t('sessions.toolRow.input')}>
      {JSON.stringify(tool.rawInput, null, 2)}
    </ScrollingPre>
  );
}

/** The exact input, how it ended, what it said, the way to the trail — and a subagent's own words. */
function ToolDetails({
  tool,
  context,
  result,
}: ToolRowProps & { readonly result: ToolResult }): React.JSX.Element {
  const { t } = useTranslation();
  // A call with a command line is drawn as it went in and what came out (plan 22, B-29).
  const command = commandOf(tool.subject);
  const said =
    tool.status === 'denied' ? (
      <p className="text-ui-xs text-destructive">
        {t('sessions.toolRow.denied', { reason: tool.summary ?? '' })}
      </p>
    ) : (
      <ToolOutputView tool={tool} result={result} />
    );

  return (
    <div className="ml-5 flex flex-col gap-2 border-l border-border pl-2">
      {command === null ? (
        <>
          <ExactInput tool={tool} />
          {said}
        </>
      ) : (
        <>
          <Side tag={t('sessions.toolRow.in')} label={t('sessions.toolRow.input')}>
            <ScrollingPre>{command}</ScrollingPre>
          </Side>
          {tool.status !== 'running' && (
            <Side tag={t('sessions.toolRow.out')} label={t('sessions.toolRow.output')}>
              {said}
            </Side>
          )}
        </>
      )}
      {tool.kind === 'agent' && <SubagentChildren tool={tool} context={context} />}
      {context.sessionId !== null && (
        <Link
          to="/audit"
          // The trail is still kept by the engine's own name of the tool (plan 28, F7): handed
          // over as the filter, never read.
          search={{ sessionId: context.sessionId, toolName: tool.origin.native }}
          className="self-start text-ui-xs underline underline-offset-4"
        >
          {t('sessions.toolRow.trail')}
        </Link>
      )}
    </div>
  );
}
