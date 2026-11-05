import { lazy, Suspense, useState } from 'react';
import { Archive, CircleX, FileText, Info, Receipt, TriangleAlert, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type {
  NoticeLevel,
  TimelineEntry,
  TurnOutcome,
  TurnSummary,
  TurnUsage,
} from '../../types/live-session';

/** The safe markdown renderer, on demand: never in the first chunk of the page (B-14, R-09) — a
 * `command.output` notice is rare next to every message, and still must not pull react-markdown
 * into the bundle everyone downloads before opening one. */
const NoticeMarkdown = lazy(() =>
  import('@/shared/components/markdown/Markdown').then((module) => ({
    default: module.Markdown,
  })),
);

/** The i18n key of a turn that did not end in `completed` — flat, never nested under `outcome`. */
const OUTCOME_KEY: Record<Exclude<TurnOutcome, 'completed'>, string> = {
  limitReached: 'sessions.turn.outcomeLimitReached',
  budgetExceeded: 'sessions.turn.outcomeBudgetExceeded',
  failed: 'sessions.turn.outcomeFailed',
  cancelled: 'sessions.turn.outcomeCancelled',
};

/** A number in the reader's language. */
function formatted(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * The rows of the system in the conversation — the end of a turn, a compaction, an undo — are one
 * line each, in a quiet tone (plan 09, B-28): what does not fit is cut on screen, and read whole by
 * a screen reader and in the tooltip.
 */
const SYSTEM_ROW = 'flex min-w-0 items-center gap-1.5 text-ui-xs text-muted-foreground';

/** One row of the system: its icon and its one line, whole in the tooltip (exported for `NoticeRow`,
 * which draws over it, plan 27, F6 · B-19). */
export function SystemRow({
  icon: Icon,
  text,
  className,
  ...props
}: {
  readonly icon: LucideIcon;
  readonly text: string;
  readonly className?: string;
} & Pick<React.ComponentProps<'li'>, 'role' | 'aria-label'>): React.JSX.Element {
  return (
    <li
      className={className === undefined ? SYSTEM_ROW : `${SYSTEM_ROW} ${className}`}
      title={text}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </li>
  );
}

/** The counts a turn row says, in its order, and how each is said — named in full for the check. */
const TOKEN_PARTS = [
  ['inputTokens', 'sessions.turn.inputTokens'],
  ['outputTokens', 'sessions.turn.outputTokens'],
] as const;

/**
 * The tokens of a turn, as far as the engine counted them: in, out and from the cache — the read and
 * the written together —, each only when it came (plan 28, B-29).
 */
function tokensOf(usage: TurnUsage | null, locale: string, t: TFunction): string {
  const parts = TOKEN_PARTS.flatMap(([field, key]) => {
    const count = usage?.[field];
    return count === undefined ? [] : [t(key, { count: formatted(count, locale) })];
  });
  const cached = [usage?.cacheReadTokens, usage?.cacheWriteTokens].filter(
    (count): count is number => count !== undefined,
  );

  if (cached.length > 0) {
    const count = formatted(
      cached.reduce((sum, each) => sum + each, 0),
      locale,
    );
    parts.push(t('sessions.turn.cacheTokens', { count }));
  }

  return parts.length === 0 ? t('sessions.turn.noTokens') : parts.join(', ');
}

/**
 * The end of a turn: what it cost, how long it took, the tokens in, out and from the cache — in the
 * reader's language (plan 08, B-23, S-97). It says what the engine reported and nothing else: no
 * cost from an engine that reports none (plan 28, S-86) — and a cost of zero as zero (S-87) —, and a
 * turn with no count says so, never `NaN` (S-98).
 *
 * A turn that did not end in `completed` says so instead of the summary above — its own `usage` and
 * `durationMs` are what the engine reports for that outcome, which a crash may leave zeroed, and a
 * row that showed them next to a real-looking cost would read as an answer nobody gave (plan 27,
 * B-10).
 */
export function TurnRow({ turn }: { readonly turn: TurnSummary }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (turn.outcome !== 'completed') {
    return <SystemRow icon={TriangleAlert} text={t(OUTCOME_KEY[turn.outcome])} />;
  }

  const cost =
    turn.costUsd === null
      ? []
      : [
          formatted(Number(turn.costUsd) || 0, locale, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 4,
          }),
        ];
  const seconds = t('sessions.turn.seconds', {
    seconds: formatted(turn.durationMs / 1000, locale, { maximumFractionDigits: 1 }),
  });
  const details = [...cost, seconds, tokensOf(turn.usage, locale, t)].join(' · ');

  return <SystemRow icon={Receipt} text={t('sessions.turn.summary', { details })} />;
}

/** Where the conversation was compacted: what came before is a summary now. */
export function CompactedRow({
  trigger,
  preTokens,
  summary,
}: {
  readonly trigger: string;
  readonly preTokens: number | null;

  /** The compaction's own summary, when its `message.completed` has arrived — collapsible, in
   * markdown (plan 27, F6 · B-21). `null` while it has not, or from an engine that sends none. */
  readonly summary: string | null;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const text =
    preTokens === null
      ? t(trigger === 'manual' ? 'sessions.compacted.manual' : 'sessions.compacted.auto')
      : t(
          trigger === 'manual'
            ? 'sessions.compacted.manualTokens'
            : 'sessions.compacted.autoTokens',
          { tokens: formatted(preTokens, i18n.language) },
        );

  if (summary === null) {
    return (
      <SystemRow
        icon={Archive}
        text={text}
        className="border-y border-dashed border-border py-1"
        role="separator"
        aria-label={t('sessions.compacted.label')}
      />
    );
  }

  return (
    <li
      className="border-y border-dashed border-border py-1"
      role="separator"
      aria-label={t('sessions.compacted.label')}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-w-0 items-center gap-1.5 text-ui-xs text-muted-foreground"
      >
        <Archive className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate" title={text}>
          {text}
        </span>
        <span className="shrink-0 underline underline-offset-4">
          {t('sessions.compacted.summary')}
        </span>
      </button>
      {open && (
        <div className="ml-5 border-l border-border pl-2 text-ui-sm">
          <Suspense fallback={<p className="whitespace-pre-wrap">{summary}</p>}>
            <NoticeMarkdown source={summary} />
          </Suspense>
        </div>
      )}
    </li>
  );
}

/**
 * What the agent put in the conversation itself, as its own quiet line — never a message bubble
 * (plan 27, F6 · B-21). The client picks it by `injected.kind`, never by the name of the tool that
 * owns it: `instructions` is a skill's body, loaded under the tool's own card.
 */
export function InjectedRow({
  injectedKind,
  name,
}: {
  readonly injectedKind: 'instructions' | 'other';
  readonly name: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const text =
    injectedKind === 'instructions'
      ? t('sessions.injected.instructions', { name: name ?? '' })
      : t('sessions.injected.other');

  return <SystemRow icon={FileText} text={text} />;
}

/**
 * Where the files of the session were put back, in the order it happened: how many went back, how
 * many stayed as they were and how many could not (plan 09, B-28) — file by file is the undo
 * dialog's.
 */
export function RewoundRow({
  entry,
}: {
  readonly entry: { readonly restored: number; readonly kept: number; readonly failed: number };
}): React.JSX.Element {
  const { t } = useTranslation();
  const text = t(entry.failed > 0 ? 'sessions.rewound.failed' : 'sessions.rewound.summary', {
    restored: entry.restored,
    kept: entry.kept,
    failed: entry.failed,
  });

  return <SystemRow icon={Undo2} text={text} />;
}

/** The icon of each level a notice carries — the same scale the tool and turn rows draw with. */
const NOTICE_ICON: Readonly<Record<NoticeLevel, LucideIcon>> = {
  info: Info,
  notice: Info,
  warning: TriangleAlert,
  error: CircleX,
};

/** The text colour of each level — `info`/`notice` read like the rest of the system rows; `warning`
 * and `error` stand out, the same tokens a tool's own `failed`/`denied` already uses. */
const NOTICE_LEVEL_CLASS: Readonly<Record<NoticeLevel, string>> = {
  info: 'text-muted-foreground',
  notice: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
};

/** The label of a notice the backend sent, by its `kind` — every one of the twelve `session.notice`
 * kinds this build knows (D-10). A `kind` not here reads as `unknown` (U-11): the client draws by
 * `kind` alone, never by `origin.engine` or `origin.native` (plan 28). */
const NOTICE_KIND_KEY: Readonly<Record<string, string>> = {
  'command.output': 'sessions.notice.kindCommandOutput',
  'agent.info': 'sessions.notice.kindAgentInfo',
  'agent.notification': 'sessions.notice.kindAgentNotification',
  'agent.stopping': 'sessions.notice.kindAgentStopping',
  'model.switched': 'sessions.notice.kindModelSwitched',
  'model.refused': 'sessions.notice.kindModelRefused',
  'request.retrying': 'sessions.notice.kindRequestRetrying',
  'usage.limited': 'sessions.notice.kindUsageLimited',
  'turn.failed': 'sessions.notice.kindTurnFailed',
  'compaction.failed': 'sessions.notice.kindCompactionFailed',
  'auth.failed': 'sessions.notice.kindAuthFailed',
};

/** The label of a line this build synthesised itself rather than read from a `session.notice` — the
 * generic line of U-06, U-07 and U-09 (plan 27, F6 · B-20). `unknownNotice` is not here: it already
 * reads by `NOTICE_KIND_KEY`'s own fallback, the same `unknown` label B-13's notice uses. */
const REASON_KEY: Readonly<Record<'unknownEvent' | 'unknownValue' | 'malformed', string>> = {
  unknownEvent: 'sessions.notice.reasonUnknownEvent',
  unknownValue: 'sessions.notice.reasonUnknownValue',
  malformed: 'sessions.notice.reasonMalformed',
};

/** The title of a notice row: what a client-synthesised line says went wrong, or the notice's own
 * kind, translated — `unknown` for one this build has no line for (B-13, U-11 alike). */
function noticeTitle(entry: Extract<TimelineEntry, { kind: 'notice' }>, t: TFunction): string {
  if (
    entry.reason === 'unknownEvent' ||
    entry.reason === 'unknownValue' ||
    entry.reason === 'malformed'
  ) {
    return t(REASON_KEY[entry.reason], { detail: entry.detail ?? '' });
  }

  const key = entry.noticeKind === undefined ? undefined : NOTICE_KIND_KEY[entry.noticeKind];
  return t(key ?? 'sessions.notice.kindUnknown', {
    detail: entry.detail ?? entry.noticeKind ?? '',
  });
}

/** The body of a notice: what the backend meant to say, translated through its `messageKey`, or its
 * own untrusted prose — never both (the contract keeps the two mutually exclusive). `null` for a line
 * with neither, which opens to nothing. */
function noticeBody(
  entry: Extract<TimelineEntry, { kind: 'notice' }>,
  t: TFunction,
): string | null {
  if (entry.messageKey !== undefined) {
    return t(entry.messageKey, entry.params ?? {});
  }

  return entry.text === null || entry.text === '' ? null : entry.text;
}

/**
 * A `session.notice`, or the generic line this build draws in its place (plan 27, F6 · B-19, B-20):
 * one row for both, the same the discovery itself asks for — a line genuinely unknown to a published
 * client is not a different kind of thing from one the backend itself could not place. `info` reads
 * collapsed, like every other system row; `warning` and `error` stand out by colour, never by moving
 * in the list. The body opens on demand — `command.output`'s own, agent prose, is the one kind drawn
 * through the safe markdown renderer (R-01); everything else, including a notice this build does not
 * recognise, is plain text. Raw HTML never becomes an element, whichever line it arrived on (S-74).
 */
export function NoticeRow({
  entry,
}: {
  readonly entry: Extract<TimelineEntry, { kind: 'notice' }>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const Icon = NOTICE_ICON[entry.level];
  const title = noticeTitle(entry, t);
  const body = noticeBody(entry, t);
  const count = entry.count ?? 1;

  return (
    <li className={`flex min-w-0 flex-col gap-1 text-ui-xs ${NOTICE_LEVEL_CLASS[entry.level]}`}>
      <button
        type="button"
        aria-expanded={open}
        disabled={body === null}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-w-0 items-center gap-1.5 text-left"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{title}</span>
        {count > 1 && (
          <span className="shrink-0 text-muted-foreground">
            {t('sessions.notice.repeated', { count })}
          </span>
        )}
      </button>
      {open && body !== null && (
        <div className="ml-5 border-l border-border pl-2 text-ui-sm text-foreground">
          {entry.noticeKind === 'command.output' ? (
            <Suspense fallback={<p className="whitespace-pre-wrap">{body}</p>}>
              <NoticeMarkdown source={body} />
            </Suspense>
          ) : (
            <p className="whitespace-pre-wrap">{body}</p>
          )}
          {entry.truncated && (
            <p className="text-ui-xs text-muted-foreground">{t('sessions.notice.truncated')}</p>
          )}
        </div>
      )}
    </li>
  );
}
