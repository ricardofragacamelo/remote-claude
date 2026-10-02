import { useCallback, useEffect, useMemo, useRef } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { itemId, merged, totalsOf, without } from '../lib/context-set';
import { asAppError } from '../lib/app-errors';
import { holdUpload, releaseUpload } from '../lib/pending-uploads';
import { DEFAULT_LIMITS, probeFile, uploadAttachment } from '../services/composer.service';
import { fetchContext } from '../services/insight.service';
import { claudePanelStore } from '../store/claude-panel.store';
import type {
  ComposerLimits,
  ContextItem,
  ContextNotice,
  ContextTotals,
  UploadItem,
} from '../types/context';
import type { ContextUse } from '../types/insight';
import { useCatalog } from './useCatalog';

/** The context of the next prompt of one conversation, and what can be done with it. */
export interface ContextSet {
  readonly items: readonly ContextItem[];
  readonly totals: ContextTotals;
  readonly limits: ComposerLimits;
  readonly notice: ContextNotice | null;

  /** Adds items — the same twice is one, and past the ceiling they are left out and said (S-235). */
  add(items: readonly ContextItem[]): void;

  /** Files dropped from the desktop: checked here first, then uploaded — never into the folder. */
  addFiles(files: readonly File[]): void;
  remove(id: string): void;

  /** Puts a set back as it was — a send that was refused keeps it whole (S-222). */
  restore(items: readonly ContextItem[]): void;

  /**
   * Checks every file again, now: gone ones are marked, and the set as it is now is answered. A file
   * that could not be read stays as it was — the backend checks it on the send, and decides.
   */
  revalidate(): Promise<readonly ContextItem[]>;
  say(notice: ContextNotice | null): void;
}

const NO_ITEMS: readonly ContextItem[] = [];

/** Whether a dropped file is one the prompt may carry, by what the browser says of it (S-237). */
function refusalOf(file: File, limits: ComposerLimits): ContextNotice | null {
  if (file.size > limits.attachmentMaxBytes) {
    return {
      key: 'composer.drop.tooLarge',
      params: { name: file.name, limit: Math.floor(limits.attachmentMaxBytes / (1024 * 1024)) },
    };
  }

  const type = file.type;
  const carried =
    limits.attachmentImageTypes.includes(type) ||
    type === '' ||
    type.startsWith('text/') ||
    type === 'application/json';

  return carried ? null : { key: 'composer.drop.unsupported', params: { name: file.name, type } };
}

function uploadItemOf(file: File, limits: ComposerLimits): UploadItem {
  return {
    id: itemId(),
    kind: 'upload',
    name: file.name,
    mediaType: file.type,
    size: file.size,
    uploadKind: limits.attachmentImageTypes.includes(file.type) ? 'image' : 'text',
    attachmentId: null,
    error: null,
  };
}

/**
 * The context of the next prompt of a tab of the panel (plan 08, B-47) — kept in the panel's store,
 * so switching tabs and reloading keep it (S-221), and each conversation has its own (S-225).
 *
 * A file is checked once it is added — its size, and whether it is text (S-224) — and again before
 * a send (S-223). A file of the desktop goes to the session as an attachment at once; in a draft it
 * waits in this page until the session exists.
 *
 * @param sessionId the session of the tab, or `null` for a draft
 */
export function useContextSet(
  folder: string,
  tabKey: string,
  sessionId: string | null,
): ContextSet {
  const panel = claudePanelStore(folder);
  const items = useStore(panel, (state) => state.contexts[tabKey]) ?? NO_ITEMS;
  const limits = useCatalog(folder, false).data?.limits ?? DEFAULT_LIMITS;
  const free = useFreeTokens(sessionId, limits.draftWindowTokens);
  const notice = useStore(panel, (state) => state.notices[tabKey]) ?? null;
  const setNotice = useCallback(
    (next: ContextNotice | null) => {
      panel.getState().setNotice(tabKey, next);
    },
    [panel, tabKey],
  );
  const probing = useRef(new Set<string>());

  const current = useCallback(() => panel.getState().contexts[tabKey] ?? NO_ITEMS, [panel, tabKey]);
  const write = useCallback(
    (next: readonly ContextItem[]) => {
      panel.getState().setContext(tabKey, next);
    },
    [panel, tabKey],
  );
  const update = useCallback(
    (id: string, change: (item: ContextItem) => ContextItem) => {
      write(current().map((item) => (item.id === id ? change(item) : item)));
    },
    [current, write],
  );

  const upload = useCallback(
    (item: UploadItem, file: File, to: string) => {
      uploadAttachment(to, file).then(
        (held) => {
          releaseUpload(item.id);
          update(item.id, (each) => ({ ...each, attachmentId: held.attachmentId }) as ContextItem);
        },
        (error: unknown) => {
          logger.warn({ op: 'composer.upload', err: String(error) }, 'attachment refused');
          update(
            item.id,
            (each) => ({ ...each, error: asAppError(error, 'composer-upload') }) as ContextItem,
          );
        },
      );
    },
    [update],
  );

  // Checks what was added and not checked yet — once per item.
  useEffect(() => {
    for (const item of items) {
      if ((item.kind === 'file' || item.kind === 'range') && item.size === null && !item.missing) {
        if (probing.current.has(item.id)) {
          continue;
        }
        probing.current.add(item.id);
        void probeFile(folder, item.path).then(
          (facts) => {
            update(item.id, () => ({ ...item, ...facts }));
          },
          (error: unknown) => {
            logger.warn(
              { op: 'composer.probe', err: String(error) },
              'file of the context unchecked',
            );
          },
        );
      }
    }
  }, [folder, items, update]);

  const totals = useMemo(() => totalsOf(items, limits, free), [free, items, limits]);

  return {
    items,
    totals,
    limits,
    notice,
    say: setNotice,
    add: useCallback(
      (incoming: readonly ContextItem[]) => {
        setNotice(addToSet(panel, tabKey, incoming));
      },
      [panel, setNotice, tabKey],
    ),
    addFiles: useCallback(
      (files: readonly File[]) => {
        const refused = files.map((file) => refusalOf(file, limits)).find((each) => each !== null);
        const accepted = files.filter((file) => refusalOf(file, limits) === null);
        const added = accepted.map((file) => ({ file, item: uploadItemOf(file, limits) }));
        const result = merged(
          current(),
          added.map((each) => each.item),
        );

        write(result.items);
        setNotice(refused ?? null);

        for (const { file, item } of added) {
          if (!result.items.includes(item)) {
            continue;
          }
          if (sessionId === null) {
            holdUpload(item.id, file);
          } else {
            upload(item, file, sessionId);
          }
        }
      },
      [current, limits, sessionId, setNotice, upload, write],
    ),
    remove: useCallback(
      (id: string) => {
        releaseUpload(id);
        write(without(current(), id));
      },
      [current, write],
    ),
    restore: write,
    revalidate: useCallback(async () => {
      const checked = await Promise.all(
        current().map(async (item) =>
          item.kind === 'file' || item.kind === 'range'
            ? { ...item, ...(await probeFile(folder, item.path).catch(uncheckedFacts)) }
            : item,
        ),
      );
      write(checked);
      return checked;
    }, [current, folder, write]),
  };
}

/**
 * Adds to the set of one tab of a panel, and answers what to say of it: past the ceiling, how many
 * were left out (S-235). The one door both the composer and "Add to Claude's context" go through.
 */
export function addToSet(
  panel: ReturnType<typeof claudePanelStore>,
  tabKey: string,
  incoming: readonly ContextItem[],
): ContextNotice | null {
  const result = merged(panel.getState().contexts[tabKey] ?? NO_ITEMS, incoming);
  panel.getState().setContext(tabKey, result.items);

  return result.overflow > 0
    ? { key: 'composer.set.overflow', params: { count: result.overflow } }
    : null;
}

/**
 * What is left of the context window: of the session, from `getContextUsage()` — the same read the
 * meter shows —, or the default a draft assumes (D-23).
 */
function useFreeTokens(sessionId: string | null, draftWindow: number): number {
  const query = useQuery<ContextUse, AppError>({
    queryKey: ['sessions', 'context', sessionId],
    queryFn: sessionId === null ? skipToken : () => fetchContext(sessionId),
    staleTime: 0,
    retry: false,
  });
  const use = query.data;

  return use === undefined || use.maxTokens <= 0
    ? draftWindow
    : Math.max(0, use.maxTokens - use.totalTokens);
}

/** A file that could not be checked again: logged, and left as it was — the backend decides. */
function uncheckedFacts(error: unknown): Record<string, never> {
  logger.warn(
    { op: 'composer.probe', err: String(error) },
    'file of the context not checked again',
  );
  return {};
}
