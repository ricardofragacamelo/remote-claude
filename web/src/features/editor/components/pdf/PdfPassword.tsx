import { useEffect, useId, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { PdfPasswordReason } from '../../types/pdf';

export interface PdfPasswordProps {
  readonly name: string;
  readonly reason: PdfPasswordReason;

  /** A password is being tried: sending again waits for it (S-24). */
  readonly trying: boolean;
  submit(password: string): void;
  cancel(): void;
}

/**
 * Asks for the password of a PDF (21 · B-09, D-07). What is typed lives in this field only, until it
 * is handed to the engine — no store, no log, no URL. A wrong one says so and comes back empty: the
 * component is drawn again for each question (S-22).
 */
export function PdfPassword({
  name,
  reason,
  trying,
  submit,
  cancel,
}: PdfPasswordProps): React.JSX.Element {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const field = useId();
  const title = useId();
  const input = useRef<HTMLInputElement>(null);

  // The question is why this preview is on screen: its field takes the focus.
  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <form
      aria-labelledby={title}
      className="m-auto flex w-full max-w-sm flex-col gap-3 p-6 text-ui-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== '' && !trying) submit(password);
      }}
    >
      <h2 id={title} className="flex items-center gap-2 font-ui-strong">
        <LockKeyhole className="size-4 shrink-0" aria-hidden />
        {t('editor.pdf.passwordTitle', { name })}
      </h2>
      {reason === 'incorrect' ? (
        <p role="alert" className="text-destructive">
          {t('editor.pdf.passwordIncorrect')}
        </p>
      ) : (
        <p className="text-muted-foreground">{t('editor.pdf.passwordNeeded')}</p>
      )}
      <label htmlFor={field}>{t('editor.pdf.passwordField')}</label>
      <input
        id={field}
        type="password"
        ref={input}
        autoComplete="off"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        className="h-8 rounded border border-input bg-background px-2"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancel}>
          {t('editor.pdf.passwordCancel')}
        </Button>
        <Button type="submit" disabled={password === '' || trying}>
          {t('editor.pdf.passwordOpen')}
        </Button>
      </div>
    </form>
  );
}
