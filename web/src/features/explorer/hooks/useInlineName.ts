import { useCallback, useRef } from 'react';

import { asExplorerError } from '../lib/batch';
import { nameProblem, NAME_PROBLEM_KEYS } from '../lib/names';
import { nameOf, parentOf } from '../lib/paths';
import { explorerStore } from '../store/explorer.store';
import type { ExplorerError } from '../types/explorer';
import { createNamed, isTaken, renameTo } from './file-operations';
import type { FolderContext } from './file-operations';
import { needsSensitiveStep } from './useOutcome';
import type { OperationRunner } from './useOutcome';

/** How a name typed in place went. */
export type NameOutcome =
  | { readonly kind: 'done' }
  /** Refused before sending — the key of why (S-171). */
  | { readonly kind: 'problem'; readonly key: string }
  /** Refused by the server — the typed text stays (S-172). */
  | { readonly kind: 'failed'; readonly error: ExplorerError }
  /** Waiting on the second step of a sensitive path. */
  | { readonly kind: 'asked' };

/** A name typed in place: for the entry being created, or the one being renamed. */
export interface InlineName {
  /** The first reason the name cannot be one, as a key — `null` when it can. */
  problemOf(name: string): string | null;

  /** Sends it — once, however many times Enter is pressed. */
  submit(name: string): Promise<NameOutcome>;

  /** `Esc`: nothing is sent (S-171). */
  cancel(): void;
}

/** Where a name goes, whether it is the name the entry already has, and the way to send it. */
interface NameTarget {
  readonly parent: string;
  readonly current: string | null;
  send(name: string, confirmSensitive: boolean): Promise<unknown>;
}

/** What is being named now — the new entry, or the one renamed — or nothing. */
function targetOf(context: FolderContext): NameTarget | null {
  const { creating, renaming } = explorerStore(context.folder).getState();

  if (creating !== null) {
    return {
      parent: creating.parent,
      current: null,
      send: (name, confirmSensitive) => createNamed(context, creating, name, { confirmSensitive }),
    };
  }

  return renaming === null
    ? null
    : {
        parent: parentOf(renaming),
        current: nameOf(renaming),
        send: (name, confirmSensitive) => renameTo(context, renaming, name, { confirmSensitive }),
      };
}

/**
 * Creating and renaming in place, as the editor people know does: the name is checked as it is typed
 * — empty, a separator, a name the folder already has — and refused **before** any request; a name
 * the server still refuses is told beside the field, with what was typed kept (S-171, S-172).
 */
export function useInlineName(context: FolderContext, runner: OperationRunner): InlineName {
  const sending = useRef(false);

  const problemOf = useCallback(
    (name: string) => {
      const target = targetOf(context);

      if (target === null) {
        return null;
      }

      const problem = nameProblem(
        name,
        (candidate) => candidate !== target.current && isTaken(context, target.parent, candidate),
      );

      return problem === null ? null : NAME_PROBLEM_KEYS[problem];
    },
    [context],
  );

  const submit = useCallback(
    async (name: string): Promise<NameOutcome> => {
      const target = targetOf(context);
      const problem = problemOf(name);

      if (target === null || name === target.current) {
        explorerStore(context.folder).getState().stopEditing();
        return { kind: 'done' };
      }

      if (problem !== null) {
        return { kind: 'problem', key: problem };
      }

      if (sending.current) {
        return { kind: 'asked' };
      }

      sending.current = true;

      try {
        await target.send(name, false);
        return { kind: 'done' };
      } catch (thrown) {
        const error = asExplorerError(thrown);

        if (!needsSensitiveStep(error)) {
          return { kind: 'failed', error };
        }

        runner.askSensitive({
          paths: [name],
          run: () =>
            runner.run('explorer.outcome.failed', [name], async () => {
              // Asked and confirmed: this time it goes with the second step.
              await target.send(name, true);
            }),
        });
        return { kind: 'asked' };
      } finally {
        sending.current = false;
      }
    },
    [context, problemOf, runner],
  );

  return {
    problemOf,
    submit,
    cancel: () => {
      explorerStore(context.folder).getState().stopEditing();
      explorerStore(context.folder).getState().requestFocus();
    },
  };
}
