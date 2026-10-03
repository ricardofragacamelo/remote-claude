import type { ReactNode } from 'react';
import { ArrowUp, Ellipsis, Slash, Square } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import type { ContextSet } from '../../hooks/useContextSet';
import { AddContextMenu } from './AddContextMenu';
import { BAR_BUTTON } from './bar';

/** The choices of the bar, as the screen that owns them renders them. */
export interface ComposerBarChoices {
  /** The name of the group — how the conversation runs. Translated. */
  readonly label: string;

  /** The mode: never leaves the bar, however narrow. */
  readonly mode: ReactNode;

  /** The model and the effort, as chips — and the same, as submenus of a narrow bar's overflow. */
  readonly choices: ReactNode;
  readonly choicesMenu: ReactNode;

  /** How full the context window is — a session's; a draft has none yet. */
  readonly meter?: ReactNode;
}

/** What sending, or stopping, needs to know. */
export interface SendControlsProps {
  /** Where the reason not to send is, for the button's description. */
  readonly reasonId: string;
  readonly disabled: boolean;
  readonly reason: string | null;

  /** Nothing written and no context. */
  readonly empty: boolean;

  /** A turn is running: what is sent waits in the queue, and stopping it is offered. */
  readonly running: boolean;
  readonly label: string | undefined;
  readonly onStop: (() => void) | undefined;
}

export interface ComposerToolbarProps {
  readonly folder: string;

  /** Without a context — an edited prompt — there is nothing to add to, and no `+` nor `/`. */
  readonly context: ContextSet | undefined;
  readonly bar: ComposerBarChoices | undefined;
  readonly send: SendControlsProps;
  onMention(): void;
  onSlash(): void;
}

/**
 * The bar under the box (plan 09, B-09): `+` · `/` · mode · model · effort · context · send or
 * stop, in that order — the order of the focus too (B-15). It is what holds for the **next** prompt.
 * Too narrow for all of it, the model and the effort go into a menu of their own; send, stop, the
 * mode and `+` never leave the bar ([web/03](../../../../../../docs/architecture/web/03-ui-system.md#o-painel-do-claude--três-faixas)).
 */
export function ComposerToolbar({
  folder,
  context,
  bar,
  send,
  onMention,
  onSlash,
}: ComposerToolbarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="@container flex min-w-0 items-center gap-0.5 px-1 pb-1">
      {context !== undefined && (
        <>
          <AddContextMenu folder={folder} context={context} onMention={onMention} />
          <IconButton
            icon={Slash}
            label={t('composer.slash.open')}
            className={BAR_BUTTON}
            onClick={onSlash}
          />
        </>
      )}
      {bar !== undefined && (
        <div
          role="group"
          aria-label={bar.label}
          className="flex min-w-0 flex-1 items-center gap-0.5"
        >
          {bar.mode}
          <div className="hidden min-w-0 items-center gap-0.5 @sm:flex">{bar.choices}</div>
          <MoreChoices>{bar.choicesMenu}</MoreChoices>
          <div className="ml-auto flex shrink-0 items-center">{bar.meter}</div>
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <SendControls {...send} />
      </div>
    </div>
  );
}

/** The overflow of a narrow bar: the model and the effort, as submenus. */
function MoreChoices({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(BAR_BUTTON, '@sm:hidden')}
          aria-label={t('composer.bar.more')}
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Send and stop, in the same place (plan 09, D-06): a turn running with an empty box makes the
 * button **stop**; with something written it sends — to the queue, and says so — with stop beside
 * it. With nothing to send, the button is off, and why is its description and its tooltip, never a
 * line on the screen (D-07).
 */
function SendControls(props: SendControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const { running, empty, onStop } = props;
  const stop =
    running && onStop !== undefined ? (
      <IconButton
        icon={Square}
        label={t('composer.send.stop')}
        className={cn(BAR_BUTTON, 'text-destructive')}
        onClick={onStop}
      />
    ) : null;

  if (stop !== null && empty) {
    return stop;
  }

  return (
    <>
      {stop}
      <SendButton {...props} />
    </>
  );
}

function SendButton(props: SendControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const words = sendWordsOf(props, t);
  const disabled = props.disabled || props.reason !== null;

  return (
    // A disabled button takes no pointer: off, its wrapper carries the tooltip (D-07).
    <span className="inline-flex" title={disabled ? words.tooltip : undefined}>
      {words.description !== null && (
        <span id={words.description.id} className="sr-only">
          {words.description.text}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="submit"
            aria-label={words.name}
            aria-describedby={words.describedBy}
            disabled={disabled}
            className={cn(BAR_BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{words.tooltip}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/**
 * What the send button is called, and what describes it: why it does not send with nothing in the
 * box, or that what it sends waits in the queue. A real block is said above the box, by the box,
 * under the same id.
 */
function sendWordsOf(
  { reasonId, reason, empty, running, label }: SendControlsProps,
  t: TFunction,
): {
  readonly name: string;
  readonly tooltip: string;
  readonly describedBy: string | undefined;

  /** What only the button says — the reason of an empty box, or the queue. */
  readonly description: { readonly id: string; readonly text: string } | null;
} {
  const name = label ?? (running ? t('composer.send.queue') : t('session.composer.send'));

  if (reason !== null) {
    const description = empty ? { id: reasonId, text: reason } : null;
    return { name, tooltip: reason, describedBy: reasonId, description };
  }

  if (running) {
    const description = { id: `${reasonId}-queued`, text: t('composer.send.queued') };
    return { name, tooltip: description.text, describedBy: description.id, description };
  }

  return { name, tooltip: name, describedBy: undefined, description: null };
}
