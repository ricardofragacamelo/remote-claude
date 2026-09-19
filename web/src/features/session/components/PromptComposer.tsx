import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/shared/components/ui/button';

/** What a turn has to be to be worth sending. The same floor the backend applies. */
const promptSchema = z.object({ text: z.string().trim().min(1) });

type PromptForm = z.infer<typeof promptSchema>;

export interface PromptComposerProps {
  readonly disabled: boolean;
  onSubmit(text: string): void;
}

/**
 * Where a turn is written.
 *
 * React Hook Form with a Zod resolver, as the web architecture asks: the shape of what may be sent
 * is declared once and the component never re-checks it by hand.
 *
 * It is **not** disabled while a turn is running. A prompt that arrives mid-turn is queued by the
 * SDK and runs next — that was measured, and refusing it was our own policy and the wrong one.
 */
export function PromptComposer({ disabled, onSubmit }: PromptComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState } = useForm<PromptForm>({
    resolver: zodResolver(promptSchema),
    defaultValues: { text: '' },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          onSubmit(values.text.trim());
          reset({ text: '' });
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
        {...register('text')}
      />

      <Button type="submit" size="touch" disabled={disabled}>
        {t('session.composer.send')}
      </Button>
    </form>
  );
}
