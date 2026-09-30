import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';

/** What a turn has to be to be worth sending. The same floor the backend applies. */
const promptSchema = z.object({ text: z.string().trim().min(1) });

type PromptForm = z.infer<typeof promptSchema>;

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
}

/**
 * Where a turn is written.
 *
 * React Hook Form with a Zod resolver, as the web architecture asks: the shape of what may be sent
 * is declared once and the component never re-checks it by hand.
 *
 * It is **not** disabled while a turn is running. A prompt that arrives mid-turn is queued by the
 * SDK and runs next — that was measured, and refusing it was our own policy and the wrong one.
 *
 * Nor does it depend on the menu: the box accepts anything typed, a slash command included, and a
 * menu that failed to load costs a shortcut and nothing else. The menu is discovery, not a fence
 * ([D-05](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export function PromptComposer({
  disabled,
  onSubmit,
  error = null,
  menu,
  draft = '',
  onDraftChange,
}: PromptComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, setValue, setFocus, formState } = useForm<PromptForm>({
    resolver: zodResolver(promptSchema),
    defaultValues: { text: draft },
  });

  const insert = (text: string): void => {
    setValue('text', text, { shouldDirty: true });
    onDraftChange?.(text);
    setFocus('text');
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Outside the form: an Enter in the menu's search box is a search, not a prompt sent. */}
      {menu?.(insert)}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            onSubmit(values.text.trim());
            reset({ text: '' });
            onDraftChange?.('');
          })(event);
        }}
      >
        <label className="text-xs uppercase opacity-70" htmlFor="prompt">
          {t('session.composer.label')}
        </label>

        <textarea
          id="prompt"
          className="min-h-24 rounded-lg border border-border bg-transparent p-2 text-sm"
          placeholder={t('session.composer.placeholder')}
          aria-invalid={formState.errors.text !== undefined}
          {...register('text', {
            onChange: (event: { target: { value: string } }) => {
              onDraftChange?.(event.target.value);
            },
          })}
        />

        {error !== null && <ErrorState error={error} />}

        <Button type="submit" size="touch" disabled={disabled}>
          {t('session.composer.send')}
        </Button>
      </form>
    </div>
  );
}
