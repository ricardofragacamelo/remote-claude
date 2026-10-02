import { useId, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { z } from 'zod';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { useCompletions } from '../hooks/useCompletions';
import type { Completions } from '../hooks/useCompletions';
import type { ContextSet } from '../hooks/useContextSet';
import { unsendable } from '../lib/context-set';
import type { Unsendable } from '../lib/context-set';
import { CompletionMenus } from './composer/CompletionMenus';
import { ContextChips } from './composer/ContextChips';

type PromptForm = { readonly text: string };

export interface PromptComposerProps {
  readonly disabled: boolean;
  onSubmit(text: string): void;

  /** Why the last prompt was refused, shown beside the box until the next one leaves. */
  readonly error?: ErrorStateProps['error'] | null;

  /**
   * What sits above the box and may write into it — the command menu. Handed the way to replace
   * the text, so the composer stays the one owner of what is being written.
   */
  readonly menu?: ((insert: (text: string) => void) => React.ReactNode) | undefined;

  /**
   * What was being written when the box was last on screen. The box is the owner while it is up;
   * this is only where it starts — a folder tab keeps it, so leaving the tab and coming back does
   * not lose the half-written prompt (plan 06, S-99).
   */
  readonly draft?: string | undefined;

  /** Told of every change to what is being written, sent or not. */
  readonly onDraftChange?: ((text: string) => void) | undefined;

  /**
   * `Esc` in the box with nothing above it open — the menu and the dialogs keep their own `Esc`,
   * which never reaches here (plan 08, B-40, S-183).
   */
  readonly onEscape?: (() => void) | undefined;

  /** What the send button says — "Send again" while a prompt is being edited. Translated. */
  readonly submitLabel?: string | undefined;

  /**
   * The context of the next prompt, with the `@` and `/` of the box (plan 08, F5). Without it, the
   * box is the plain one of an edited prompt: what is typed is what is sent.
   */
  readonly context?: ContextSet | undefined;

  /** The folder of the tab — what `@` completes from — and the session, `null` in a draft. */
  readonly folder?: string | undefined;
  readonly sessionId?: string | null | undefined;

  /** A turn is running: what is sent now waits in the queue, and the box says so (S-217). */
  readonly queued?: boolean | undefined;

  /** A draft: its attachments leave once the session it opens exists. */
  readonly pendingUploads?: boolean | undefined;
}

/** The longest the box grows before it scrolls. */
const MAX_HEIGHT_PX = 240;

/**
 * Where a turn is written (plan 08, B-46).
 *
 * React Hook Form with a Zod resolver, as the web architecture asks: what may be sent is declared
 * once — text, or context — and the component never re-checks it by hand. Enter sends, Shift+Enter
 * breaks the line, and Enter while an input method composes a character does neither (S-214).
 * Nothing at all to send keeps the button off, and says why (S-215).
 *
 * It is **not** disabled while a turn is running: what is sent then waits in the queue of the
 * backend, and the box says so (S-217). Nor does it depend on its menus: what is typed is what is
 * sent, a slash command included, and a menu that failed to load costs a shortcut and nothing else
 * ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export function PromptComposer(props: PromptComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const form = useComposerForm(props);
  const folder = props.folder ?? '';
  const completions = useCompletions(
    props.context,
    folder,
    props.sessionId ?? null,
    form.text,
    form.cursor,
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Outside the form: an Enter in the menu's search box is a search, not a prompt sent. */}
      {props.menu?.(form.insert)}

      {props.context !== undefined && (
        <ContextChips
          folder={folder}
          items={props.context.items}
          totals={props.context.totals}
          notice={props.context.notice}
          onRemove={props.context.remove}
        />
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          void form.submit(event);
        }}
      >
        <label className="text-xs uppercase opacity-70" htmlFor={form.boxId}>
          {t('session.composer.label')}
        </label>

        <CompletionMenus
          completions={completions}
          onPick={(index) => {
            completions.pick(index, form.text, form.cursor, form.write);
          }}
        />

        <ComposerBox props={props} form={form} completions={completions} />

        {completions.hint !== null && (
          <p className="font-mono text-ui-xs text-muted-foreground">
            {t('composer.slash.argumentHint', { hint: completions.hint })}
          </p>
        )}

        {props.error != null && <ErrorState error={props.error} />}

        <SendRow
          reasonId={form.reasonId}
          disabled={props.disabled}
          reason={reasonOf(t, form.empty, form.blocked)}
          queued={props.queued === true}
          submitLabel={props.submitLabel}
        />
      </form>
    </div>
  );
}

/** The form of the box: what is written, where the cursor is, and the way to send it. */
interface ComposerForm {
  readonly text: string;
  readonly cursor: number;
  readonly boxId: string;
  readonly reasonId: string;

  /** Nothing written and nothing in the context. */
  readonly empty: boolean;
  readonly blocked: Unsendable | null;
  readonly field: UseFormRegisterReturn<'text'>;

  /** The element of the box, for the cursor to follow what is written. */
  attach(element: HTMLTextAreaElement | null): void;
  setCursor(at: number): void;

  /** Replaces what is written, and puts the cursor at `at`. */
  write(text: string, at: number): void;
  insert(text: string): void;
  submit(event?: React.BaseSyntheticEvent): Promise<void>;
}

function useComposerForm(props: PromptComposerProps): ComposerForm {
  const draft = props.draft ?? '';
  const hasContext = (props.context?.items.length ?? 0) > 0;
  const schema = useMemo(
    () =>
      z.object({ text: z.string() }).refine((form) => form.text.trim() !== '' || hasContext, {
        path: ['text'],
      }),
    [hasContext],
  );
  const { register, handleSubmit, reset, setValue, control } = useForm<PromptForm>({
    resolver: zodResolver(schema),
    defaultValues: { text: draft },
  });
  const text = useWatch({ control, name: 'text' });
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(draft.length);
  const boxId = useId();
  const reasonId = useId();
  const blocked =
    props.context === undefined
      ? null
      : unsendable(props.context.items, props.context.totals, props.pendingUploads === true);

  const write = (next: string, at: number): void => {
    setValue('text', next, { shouldDirty: true });
    props.onDraftChange?.(next);
    setCursor(at);
    // The box is not controlled: the value is already on it, and the cursor can follow at once.
    box.current?.focus();
    box.current?.setSelectionRange(at, at);
  };

  return {
    text,
    cursor,
    boxId,
    reasonId,
    empty: text.trim() === '' && !hasContext,
    blocked,
    attach: (element) => {
      box.current = element;
    },
    field: register('text', {
      onChange: (event: { target: { value: string } }) => {
        props.onDraftChange?.(event.target.value);
      },
    }),
    setCursor,
    write,
    insert: (next) => {
      write(next, next.length);
    },
    submit: handleSubmit((values) => {
      if (blocked !== null) {
        return;
      }
      props.onSubmit(values.text.trim());
      reset({ text: '' });
      setCursor(0);
      props.onDraftChange?.('');
    }),
  };
}

/** The box itself: the keys of its menus first, then `Esc`, then Enter. */
function ComposerBox({
  props,
  form,
  completions,
}: {
  readonly props: PromptComposerProps;
  readonly form: ComposerForm;
  readonly completions: Completions;
}): React.JSX.Element {
  const { t } = useTranslation();
  const composing = useRef(false);
  const { ref, onChange, ...field } = form.field;

  return (
    <textarea
      id={form.boxId}
      rows={3}
      className="field-sizing-content min-h-24 rounded-lg border border-border bg-transparent p-2 text-sm"
      style={{ maxHeight: MAX_HEIGHT_PX }}
      placeholder={t('session.composer.placeholder')}
      {...ariaOf(props, form, completions)}
      {...field}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onSelect={(event) => {
        form.setCursor(event.currentTarget.selectionStart);
      }}
      onChange={(event) => {
        form.setCursor(event.target.selectionStart);
        completions.edited(event.target.value, event.target.selectionStart);
        void onChange(event);
      }}
      onKeyDown={(event) => {
        if (!completions.keyDown(event, form.text, form.cursor, form.write)) {
          boxKey(event, props, form, composing.current);
        }
      }}
      ref={(element) => {
        form.attach(element);
        ref(element);
      }}
    />
  );
}

/** What the box tells assistive technology: why it does not send, and the menu it drives. */
function ariaOf(
  props: PromptComposerProps,
  form: ComposerForm,
  completions: Completions,
): React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  const why = form.empty || form.blocked !== null;

  return {
    'aria-describedby': why ? form.reasonId : undefined,
    'aria-autocomplete': props.context === undefined ? undefined : 'list',
    'aria-controls': completions.open === null ? undefined : completions.listId,
    'aria-activedescendant': completions.activeId ?? undefined,
  };
}

/** A key of the box that no menu took: `Esc` is the screen's, Enter sends, Shift+Enter breaks. */
function boxKey(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  props: PromptComposerProps,
  form: ComposerForm,
  composing: boolean,
): void {
  if (event.key === 'Escape') {
    if (!event.defaultPrevented) {
      props.onEscape?.();
    }
    return;
  }

  const composingNow = composing || event.nativeEvent.isComposing;
  if (event.key !== 'Enter' || event.shiftKey || composingNow) {
    return;
  }

  event.preventDefault();
  if (!props.disabled && !form.empty) {
    void form.submit();
  }
}

/** The send button, and why it does not send when it does not — or that it will queue. */
function SendRow({
  reasonId,
  disabled,
  reason,
  queued,
  submitLabel,
}: {
  readonly reasonId: string;
  readonly disabled: boolean;
  readonly reason: string | null;
  readonly queued: boolean;
  readonly submitLabel: string | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      {reason !== null && (
        <p id={reasonId} className="text-ui-xs text-muted-foreground">
          {reason}
        </p>
      )}
      {queued && (
        <p role="status" className="text-ui-xs text-muted-foreground">
          {t('composer.send.queued')}
        </p>
      )}
      <Button
        type="submit"
        size="touch"
        disabled={disabled || reason !== null}
        aria-describedby={reason === null ? undefined : reasonId}
      >
        {submitLabel ?? (queued ? t('composer.send.queue') : t('session.composer.send'))}
      </Button>
    </div>
  );
}

function reasonOf(t: TFunction, empty: boolean, blocked: Unsendable | null): string | null {
  if (empty) {
    return t('composer.send.empty');
  }

  switch (blocked?.reason) {
    case 'missing':
      return t('composer.send.missing', { path: blocked.path });
    case 'upload':
      return t('composer.send.upload', { name: blocked.name });
    case 'over':
      return blocked.over === 'items' ? t('composer.set.overItems') : t('composer.set.overBytes');
    default:
      return null;
  }
}
