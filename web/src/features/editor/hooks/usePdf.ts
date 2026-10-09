import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { loadPdfEngine } from '../lib/pdf-loader';
import { followDisk } from '../services/disk-changes.service';
import { readRaw } from '../services/raw.service';
import type { PdfDocument, PdfPasswordPrompt, PdfPasswordReason } from '../types/pdf';
import { previewError } from '../lib/preview-errors';
import { asAppError } from './documents';
import { useAttempt } from './useAttempt';

/** A PDF of the folder, opened — or why it is not, or the password it waits for. */
export interface PdfState {
  readonly doc: PdfDocument | null;

  /** The file did not arrive, or the engine did not load. */
  readonly error: AppError | null;

  /** It arrived and it is not a PDF that can be read. */
  readonly corrupt: boolean;

  /** The password is asked now, and why — the first time, or after a wrong one (S-21, S-22). */
  readonly password: PdfPasswordReason | null;

  /** A password typed is being tried: sending another waits (S-24). */
  readonly trying: boolean;

  /** The person gave up on the password: "protected", with "try again" (S-23). */
  readonly locked: boolean;

  /** Tries a password — once: a second one while it is tried is dropped. Never kept, never logged. */
  submitPassword(password: string): void;
  cancelPassword(): void;
  retry(): void;
}

/** What an opening gave, and which one it was — the answer to an older one is not on screen. */
interface Opened {
  readonly key: string;
  readonly doc: PdfDocument | null;
  readonly error: AppError | null;
  readonly corrupt: boolean;
  readonly password: PdfPasswordReason | null;
  readonly trying: boolean;
  readonly locked: boolean;
}

/** An opening that has nothing to say yet. */
const NOTHING = {
  doc: null,
  error: null,
  corrupt: false,
  password: null,
  trying: false,
  locked: false,
} as const;

/**
 * The bytes of a PDF opened by the engine — `null` for bytes it cannot read, `'locked'` for a
 * password the person did not give.
 */
async function opened(
  folder: string,
  path: string,
  signal: AbortSignal,
  password: PdfPasswordPrompt,
): Promise<PdfDocument | 'locked' | null> {
  const [file, engine] = await Promise.all([readRaw(folder, path, signal), loadPdfEngine()]);
  const data = new Uint8Array(await file.blob.arrayBuffer());

  try {
    return await engine.open(data, password);
  } catch (error) {
    logger.debug({ op: 'editor.pdf.open', folder, err: String(error) }, 'pdf not readable');
    return null;
  }
}

/**
 * A PDF of the folder, read with the credential in the header and opened by the pdf.js of our build
 * (B-50, S-311) — never handed to the browser's own viewer. The document is let go when the view
 * goes; a read still on its way is aborted. A PDF with a password asks for it (21 · D-07): what is
 * typed goes to the engine and nowhere else — no store, no log, no URL, no request. When the file
 * changes on disk, it is opened again (S-28).
 */
export function usePdf(folder: string, path: string): PdfState {
  const [state, setState] = useState<Opened | null>(null);
  const { key, retry } = useAttempt(folder, path);
  const locale = useTranslation().i18n.language;
  // Who receives the password asked for now — `null` while none is asked, or one is being tried.
  const answer = useRef<((password: string | null) => void) | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let doc: PdfDocument | null = null;
    let pending: ((password: string | null) => void) | null = null;

    const ask: PdfPasswordPrompt = (reason) =>
      new Promise((resolve) => {
        logger.debug({ op: 'editor.pdf.password', reason }, 'pdf password asked');
        pending = resolve;
        answer.current = resolve;
        setState({ key, ...NOTHING, password: reason });
      });

    opened(folder, path, controller.signal, ask).then(
      (result) => {
        if (controller.signal.aborted) {
          if (result !== null && result !== 'locked') result.destroy();
          return;
        }

        doc = result === 'locked' ? null : result;
        setState({
          key,
          ...NOTHING,
          doc,
          corrupt: result === null,
          locked: result === 'locked',
        });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ key, ...NOTHING, error: previewError(asAppError(error), path, locale) });
        }
      },
    );

    return () => {
      controller.abort();
      // A password still asked for is given up on: the opening ends, and lets go of what it read.
      if (pending !== null && answer.current === pending) {
        answer.current = null;
      }
      pending?.(null);
      doc?.destroy();
    };
  }, [folder, path, key, locale]);

  useEffect(
    () =>
      followDisk(folder, {
        changed: (changes, overflow) => {
          if (overflow || changes.some((change) => change.path === path)) {
            retry();
          }
        },
        // What changed meanwhile is unknown, and reading the PDF again on every reconnection would
        // throw the reader's place away for nothing: the next change opens it again.
        resumed: () => undefined,
      }),
    [folder, path, retry],
  );

  const reply = useCallback((password: string | null) => {
    const resolve = answer.current;

    if (resolve === null) {
      return;
    }

    answer.current = null;
    setState((current) => (current === null ? current : { ...current, trying: true }));
    resolve(password);
  }, []);

  const current = state?.key === key ? state : { key, ...NOTHING };

  return {
    doc: current.doc,
    error: current.error,
    corrupt: current.corrupt,
    password: current.password,
    trying: current.trying,
    locked: current.locked,
    submitPassword: reply,
    cancelPassword: () => {
      reply(null);
    },
    retry,
  };
}
