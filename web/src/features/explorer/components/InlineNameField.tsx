import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { NameOutcome } from '../hooks/useInlineName';
import { reasonKeyOf } from '../lib/reasons';
import type { NewEntryKind } from '../types/explorer';

export interface InlineNameFieldProps {
  readonly kind: NewEntryKind;
  readonly initialName: string;

  /** What the field is for, translated — "Name of the new file". */
  readonly label: string;
  problemOf(name: string): string | null;
  submit(name: string): Promise<NameOutcome>;
  cancel(): void;
}

/** What is said under the field: why the name cannot be, or why the server refused it. */
type Said = { readonly key: string; readonly params: Readonly<Record<string, unknown>> } | null;

/** The part of a file's name typed over first — before its extension, as the editor people know does. */
function stemLength(name: string, kind: NewEntryKind): number {
  const dot = name.lastIndexOf('.');
  return kind === 'file' && dot > 0 ? dot : name.length;
}

/**
 * A name typed in place — of a new entry, or of one renamed (`F2`).
 *
 * `Enter` sends, `Esc` gives up with nothing sent (S-171); leaving the field keeps it, as typed. The name is checked as it is typed, and a
 * name that cannot be one is refused before any request; a refusal of the server — the name is
 * taken — is said under the field, and what was typed stays (S-172).
 */
export function InlineNameField({
  kind,
  initialName,
  label,
  problemOf,
  submit,
  cancel,
}: InlineNameFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState(initialName);
  const [said, setSaid] = useState<Said>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const messageId = useId();

  useEffect(() => {
    const take = (): void => {
      field.current?.focus();
      field.current?.setSelectionRange(0, stemLength(initialName, kind));
    };

    take();
    // Again once the menu, the palette or the dialog that asked for the name has given the focus
    // back to whoever had it — the field is where the keys are for.
    const again = setTimeout(() => {
      if (document.activeElement !== field.current) {
        take();
      }
    }, 0);
    return () => {
      clearTimeout(again);
    };
  }, [initialName, kind]);

  const send = async (): Promise<void> => {
    if (sending) {
      return;
    }

    setSending(true);
    const outcome = await submit(text);
    setSending(false);

    if (outcome.kind === 'problem') {
      setSaid({ key: outcome.key, params: {} });
    } else if (outcome.kind === 'failed') {
      setSaid({ key: reasonKeyOf(outcome.error, 'operation'), params: outcome.error.params });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void send();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <span className="relative min-w-0 flex-1">
      <input
        ref={field}
        value={text}
        aria-label={label}
        aria-invalid={said !== null}
        aria-describedby={said === null ? undefined : messageId}
        readOnly={sending}
        spellCheck={false}
        className="h-full w-full min-w-0 rounded-sm border border-ring bg-background px-1 text-ui outline-none"
        onChange={(event) => {
          setText(event.target.value);
          const problem = problemOf(event.target.value);
          setSaid(problem === null ? null : { key: problem, params: {} });
        }}
        onKeyDown={onKeyDown}
      />
      {said !== null && (
        <span
          id={messageId}
          role="alert"
          className="absolute top-full right-0 left-0 z-10 rounded-sm border border-destructive bg-background px-1 py-0.5 text-ui-sm text-destructive"
        >
          {t(said.key, { ...said.params })}
        </span>
      )}
    </span>
  );
}
