import { useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { languageOf } from '../lib/languages';
import { readFile, readVersion } from '../services/files.service';
import { diffSources } from '../store/diff-sources';
import { editorStoreOf } from '../store/editor.store';
import type { DiffSide, ProvidedSide } from '../types/editor';
import { asAppError } from './documents';

/** The two texts of a diff tab, once they are read. */
export type DiffContentState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: AppError }
  | {
      readonly status: 'ready';
      readonly original: string;
      readonly modified: string;
      readonly language: string;
    };

/**
 * One side of a diff: the buffer of its open file — what the person has typed —, a version the local
 * history kept, or the file as it is on disk now. A buffer side whose file is no longer open is the
 * disk's.
 */
async function textOf(folder: string, side: DiffSide): Promise<string> {
  if (side.source === 'history' && side.version !== undefined) {
    return readVersion(folder, side.version.entryId);
  }

  if (side.source === 'provided' && side.provided !== undefined) {
    return providedText(folder, side.provided);
  }

  const model = editorStoreOf(folder).getState().docs[side.path]?.model;

  if (side.source === 'buffer' && model !== null && model !== undefined) {
    return model.getValue();
  }

  const read = await readFile(folder, side.path);
  return read.kind === 'read' ? read.file.content : '';
}

/** A side another feature provides (plan 08), read by the source it names. */
function providedText(folder: string, provided: ProvidedSide): Promise<string> {
  const reader = diffSources.entries().find((entry) => entry.id === provided.source);

  if (reader === undefined) {
    return Promise.reject(new Error(`no diff source "${provided.source}" is registered`));
  }

  return reader.read(folder, provided.key);
}

/** The texts of a diff tab (B-38), read when the tab shows — and again when its sides change. */
export function useDiffContent(folder: string, left: DiffSide, right: DiffSide): DiffContentState {
  const [state, setState] = useState<DiffContentState>({ status: 'loading' });
  const key = JSON.stringify([folder, left, right]);

  useEffect(() => {
    let live = true;
    const [, from, to] = JSON.parse(key) as [string, DiffSide, DiffSide];

    Promise.all([textOf(folder, from), textOf(folder, to)]).then(
      ([original, modified]) => {
        if (live) {
          setState({ status: 'ready', original, modified, language: languageOf(to.path) });
        }
      },
      (error: unknown) => {
        if (live) {
          setState({ status: 'failed', error: asAppError(error) });
        }
      },
    );

    return () => {
      live = false;
    };
  }, [folder, key]);

  return state;
}
