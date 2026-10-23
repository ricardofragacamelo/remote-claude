import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Moves the focus to [ref] whenever [step] changes from one known value to a different one — never
 * on the first render a step is seen, which is either the dialog's own first open (Radix's default
 * autofocus already gets that right) or the very first value this hook was ever called with.
 *
 * Without this, the control that advanced a two-step wizard (`WizardFooter`'s own "Next"/"Confirm")
 * is removed together with the step it belonged to, and the focus Radix's `FocusScope` redirects it
 * to afterwards is whichever focusable element is first in the new step's DOM — the preview step's
 * own "Confirm" button, not the content a person is meant to read before pressing it. Shared by
 * `mcp`'s own `AddEditServerDialog` and an engine extension's own `AddLocalPluginDialog` (plan 13,
 * B-30, S-140), rather than each hand-copying the same effect.
 *
 * `null` means "no step at all" (the dialog is closed): closing, and the open that follows, are
 * never a "change" this hook acts on — only a step actually replacing another one, while the dialog
 * stays open, is.
 */
export function useWizardStepFocus(step: string | null, ref: RefObject<HTMLElement | null>): void {
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current !== null && step !== null && step !== previous.current) {
      ref.current?.focus();
    }
    previous.current = step;
  });
}
