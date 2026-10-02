import { useCallback, useMemo, useRef, useState } from 'react';

import { asExplorerError } from '../lib/batch';
import type { ItemResult } from '../lib/batch';
import type { ExplorerError } from '../types/explorer';

/** What an operation that did not wholly go is shown with — the title, and each item's outcome. */
export interface Outcome {
  /** A translation key, named in full where the operation is. */
  readonly titleKey: string;
  readonly results: readonly ItemResult[];

  /** The context the messages are read in — an undo explains its refusals its own way (S-185). */
  readonly context: 'operation' | 'undo';
}

/** An operation stopped by the second step of a path that changes what Claude may do (07 · D-15). */
export interface SensitiveRequest {
  readonly paths: readonly string[];

  /** Sends it again, confirmed. */
  run(): Promise<void>;
}

/** Whether a failure is the server asking for the second step of a sensitive path. */
export function needsSensitiveStep(error: ExplorerError): boolean {
  return error.code === 'PRECONDITION_REQUIRED' && error.params['reason'] === 'sensitiveFile';
}

/** An operation on some entries — with the second step of a sensitive path, or not. */
export type OperationOn = (
  paths: readonly string[],
  confirmSensitive: boolean,
) => Promise<readonly ItemResult[] | null | void>;

/** The entries of a batch the server asked the second step for. */
function sensitiveOf(results: readonly ItemResult[]): readonly string[] {
  return results.flatMap((result) =>
    !result.ok && needsSensitiveStep(result.error) ? [result.path] : [],
  );
}

/** How an operation is run: one at a time, its failures shown, its second step asked. */
export interface OperationRunner {
  readonly outcome: Outcome | null;
  readonly sensitive: SensitiveRequest | null;
  readonly busy: boolean;

  /**
   * Runs an operation on `paths`, unless one is running — two presses of "Paste" paste once. A
   * refusal is shown in the outcome under `titleKey`. The entries the server asks the sensitive step
   * for are asked about, and — confirmed — sent again, those only: what already went does not go twice.
   */
  run(
    titleKey: string,
    paths: readonly string[],
    operation: OperationOn,
    context?: Outcome['context'],
  ): Promise<void>;
  show(outcome: Outcome): void;
  closeOutcome(): void;

  /** Asks the second step for an operation that has its own place for errors — a name typed in place. */
  askSensitive(request: SensitiveRequest): void;
  confirmSensitive(): Promise<void>;
  cancelSensitive(): void;
}

/**
 * Runs the explorer's operations, and keeps what they leave to say: the outcome of each item when
 * something did not go (S-182), and the second step a sensitive path asks for. The error is told
 * where the operation happened — a dialog over the tree, since a paste or an undo has no field of its
 * own (B-26).
 */
export function useOperationRunner(): OperationRunner {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const run = useCallback<OperationRunner['run']>(
    async (titleKey, paths, operation, context = 'operation') => {
      if (running.current) {
        return;
      }

      running.current = true;
      setBusy(true);

      const finish = (results: readonly ItemResult[]): void => {
        if (results.some((result) => !result.ok)) {
          setOutcome({ titleKey, results, context });
        }
      };

      /** One round: what each entry did — a refusal of the whole of it is the first entry's. */
      const attempt = async (
        subset: readonly string[],
        confirmSensitive: boolean,
      ): Promise<readonly ItemResult[]> => {
        try {
          return (await operation(subset, confirmSensitive)) ?? [];
        } catch (thrown) {
          const error = asExplorerError(thrown);
          return subset.slice(0, 1).map((path) => ({ path, ok: false, error }));
        }
      };

      const first = async (): Promise<void> => {
        const results = await attempt(paths, false);
        const asked = sensitiveOf(results);

        if (asked.length === 0) {
          finish(results);
          return;
        }

        setSensitive({
          paths: asked,
          run: async () => {
            const again = await attempt(asked, true);
            finish([...results.filter((result) => !asked.includes(result.path)), ...again]);
          },
        });
      };

      try {
        await first();
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const confirmSensitive = useCallback(async () => {
    const request = sensitive;
    setSensitive(null);
    await request?.run();
  }, [sensitive]);

  return useMemo(
    () => ({
      outcome,
      sensitive,
      busy,
      run,
      show: setOutcome,
      closeOutcome: () => {
        setOutcome(null);
      },
      askSensitive: setSensitive,
      confirmSensitive,
      cancelSensitive: () => {
        setSensitive(null);
      },
    }),
    [busy, confirmSensitive, outcome, run, sensitive],
  );
}
