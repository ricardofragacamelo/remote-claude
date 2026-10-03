import { lazy, memo, Suspense, useDeferredValue } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import { IconButton } from '@/shared/components/IconButton';
import { useCopy } from '@/shared/hooks/useCopy';
import { cn } from '@/shared/lib/utils';
import type { MessageBlock, StreamMessage } from '../../types/live-session';
import { MessageActions } from './MessageActions';
import { ThinkingBlock } from './ThinkingBlock';
import type { TimelineContext } from './timeline-context';

/** The renderer of markdown, on demand: never in the first chunk of the page (B-14, R-09). */
const ChatMarkdown = lazy(() => import('./ChatMarkdown'));

/**
 * Text of the answer, rendered — and, while the renderer loads, the text as it is.
 *
 * The text is read **deferred**: an answer of hundreds of kilobytes streaming in is parsed again as
 * fragments arrive, and that work yields to what the person types (S-64).
 */
function TextBlock({
  text: arriving,
  folder,
}: {
  readonly text: string;
  readonly folder: string;
}): React.JSX.Element {
  const text = useDeferredValue(arriving);

  return (
    <Suspense fallback={<p className="text-ui whitespace-pre-wrap">{text}</p>}>
      <ChatMarkdown source={text} folder={folder} />
    </Suspense>
  );
}

/** One block of a message, drawn as what it is. */
function Block({
  block,
  message,
  streaming,
  folder,
}: {
  readonly block: MessageBlock;
  readonly message: StreamMessage;
  readonly streaming: boolean;
  readonly folder: string;
}): React.JSX.Element {
  return block.kind === 'text' ? (
    <TextBlock text={block.text} folder={folder} />
  ) : (
    <ThinkingBlock block={block} thinkingMs={message.thinkingMs} streaming={streaming} />
  );
}

/** A prompt of the main conversation can be sent again — never a subagent's, never an answer. */
function isResendable(message: StreamMessage, context: TimelineContext): boolean {
  return (
    message.role === 'user' &&
    message.parentToolUseId === null &&
    message.text !== '' &&
    context.prompts !== undefined
  );
}

/**
 * A message is drawn again only when it changed, the search arrived at it or left it, or what can
 * be done from a prompt changed — a turn began, and the undo waits for it to end.
 */
function sameMessage(
  before: { readonly message: StreamMessage; readonly context: TimelineContext },
  after: { readonly message: StreamMessage; readonly context: TimelineContext },
): boolean {
  const id = after.message.messageId;

  return (
    before.message === after.message &&
    before.context.folder === after.context.folder &&
    (before.context.current === id) === (after.context.current === id) &&
    before.context.prompts?.undoBlocked === after.context.prompts?.undoBlocked &&
    (before.context.prompts?.onUndo === undefined) === (after.context.prompts?.onUndo === undefined)
  );
}

/**
 * One message of the conversation: its blocks in order — thinking folded, the answer in markdown —
 * and the one still arriving. The reducer keeps every other message as it was, so only the message
 * in flight renders again as fragments come (S-64).
 * "Copy" copies the markdown it was written in (S-100), from its button and its context menu.
 */
export const MessageItem = memo(function MessageItem({
  message,
  context,
}: {
  readonly message: StreamMessage;
  readonly context: TimelineContext;
}): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy(message.text);
  const current = context.current === message.messageId;
  const resendable = isResendable(message, context);

  return (
    <li
      data-message-id={message.messageId}
      aria-current={current ? 'true' : undefined}
      className={cn('group flex flex-col gap-1 rounded-md', current && 'ring-2 ring-ring')}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-ui-xs uppercase text-muted-foreground">
                {t(`session.role.${message.role}`)}
              </span>
              {message.text !== '' && (
                <IconButton
                  icon={ClipboardCopy}
                  label={t('sessions.message.copy')}
                  className="ml-auto"
                  onClick={() => {
                    copy.copy();
                  }}
                />
              )}
              {resendable && context.prompts !== undefined && (
                <MessageActions message={message} actions={context.prompts} />
              )}
            </div>
            {message.blocks.map((block, index) => (
              <Block
                key={index}
                block={block}
                message={message}
                streaming={false}
                folder={context.folder}
              />
            ))}
            {message.streaming !== null && (
              <Block
                block={{ kind: message.streaming.kind, text: message.streaming.text }}
                message={message}
                streaming
                folder={context.folder}
              />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => {
              copy.copy();
            }}
          >
            {t('sessions.message.copy')}
          </ContextMenuItem>
          {resendable && (
            <>
              <ContextMenuItem
                onSelect={() => {
                  context.prompts?.onEdit?.(message);
                }}
              >
                {t('sessions.message.edit')}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  context.prompts?.onFork?.(message);
                }}
              >
                {t('sessions.message.forkFrom')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <span role="status" className="sr-only">
        {copy.state === 'copied' ? t('sessions.message.copied') : ''}
      </span>
    </li>
  );
}, sameMessage);
