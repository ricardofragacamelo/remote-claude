import { useEffect, useMemo, useReducer, useState } from 'react';

import { activeView, openFile } from '@/features/editor';
import { useCommands, useKeyContext } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import {
  parseCodeSearch,
  searchQueryOf,
  serializeCodeSearch,
  withContextLines,
} from '../lib/code-search-format';
import type { CodeSearchHeader } from '../lib/code-search-format';
import { searchText } from '../services/search.service';
import type { SearchFileResult } from '../types/search';

/** The spinner's own range (S-132) — the task names it in full: adjustable from 1 to 9. */
export const MIN_CONTEXT_LINES = 1;
export const MAX_CONTEXT_LINES = 9;

/** The slice of an open file's own document this hook reads and writes. */
export interface ResultsEditorDoc {
  readonly path: string;
  readonly model: {
    getValue(): string;
    setValue(text: string): void;
    onDidChange(listener: () => void): () => void;
  } | null;
}

export interface ResultsEditorView {
  readonly header: CodeSearchHeader;
  readonly isRunning: boolean;
  readonly error: AppError | null;
  setContextLines(n: number): void;
  runAgain(): void;
}

/** `n`, kept inside the spinner's own 1–9. */
function clampContextLines(n: number): number {
  return Math.min(MAX_CONTEXT_LINES, Math.max(MIN_CONTEXT_LINES, Math.trunc(n)));
}

/** Every file the stream of `searchText` gathers, or the error it closed with. */
async function runSearchText(
  folder: string,
  header: CodeSearchHeader,
  signal: AbortSignal,
): Promise<readonly SearchFileResult[]> {
  const files: SearchFileResult[] = [];

  for await (const frame of searchText(folder, searchQueryOf(header), signal)) {
    if (frame.type === 'file') {
      files.push(frame.file);
    } else if (frame.type === 'error') {
      throw frame.error;
    }
  }

  return files;
}

/**
 * Wires one open `.code-search` tab (plan 11, B-17): its own header read back from the buffer, the
 * context-lines spinner, "run again" (S-132), and the `F12` that opens a result at its real file
 * and line — never a write to a file the search found (S-133), only to this document's own buffer.
 */
export function useResultsEditor(folder: string, doc: ResultsEditorDoc): ResultsEditorView {
  const [isRunning, setRunning] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // The model's own reference never changes when its text does (plan 07) — only its own
  // `onDidChange` says the buffer moved, so the header read back from it is read again.
  const [changed, bumpChanged] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () => (doc.model === null ? undefined : doc.model.onDidChange(bumpChanged)),
    [doc.model],
  );

  const parsed = useMemo(
    () => (doc.model === null ? parseCodeSearch('') : parseCodeSearch(doc.model.getValue())),
    // `changed` is read through `doc.model.getValue()`, not by name — it is what makes this
    // recompute after `setContextLines`/`runAgain` edit the same model reference in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `changed` has no name in the body
    [doc.model, changed],
  );

  function setContextLines(n: number): void {
    if (doc.model !== null) {
      doc.model.setValue(withContextLines(doc.model.getValue(), clampContextLines(n)));
    }
  }

  function runAgain(): void {
    if (doc.model === null) {
      return;
    }
    const model = doc.model;

    setRunning(true);
    setError(null);

    const controller = new AbortController();
    runSearchText(folder, parsed.header, controller.signal)
      .then((files) => {
        model.setValue(serializeCodeSearch(parsed.header, files));
      })
      .catch((caught: unknown) => {
        logger.warn(
          { op: 'search.resultsEditor.runAgain', folder, path: doc.path },
          'running the results editor again failed',
        );
        setError(
          caught instanceof AppError
            ? caught
            : new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'searchEditor', {}),
        );
      })
      .finally(() => {
        setRunning(false);
      });
  }

  const declarations: readonly CommandDeclaration[] = [
    {
      id: 'search.resultsEditor.goToResult',
      labelKey: 'command.search.goToResult',
      category: 'go',
      run: () => {
        const line = activeView(folder)?.position().line;
        const result = line === undefined ? undefined : parsed.results.get(line);

        if (result !== undefined) {
          openFile(folder, result.path, { line: result.line });
        }
      },
      keys: [{ key: 'F12', context: 'searchEditor' }],
    },
  ];

  useKeyContext('searchEditor');
  useCommands(declarations);

  return { header: parsed.header, isRunning, error, setContextLines, runAgain };
}
