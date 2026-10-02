import { SESSION_PROMPT_PAYLOAD_LIMITS } from '@remote-claude/contracts';
import type { SessionPromptPayloadAttachmentsItem } from '@remote-claude/contracts';

import type { FilesDragPayload } from '@/shared/lib/files-drag';
import type { ComposerLimits, ContextItem, ContextTotals, FileFacts } from '../types/context';

/** How many items one prompt carries — the `maxItems` of the schema. */
export const MAX_CONTEXT_ITEMS = SESSION_PROMPT_PAYLOAD_LIMITS.attachments.maxItems;

/** ≈ bytes a token, for the estimate the set shows — said to be one (D-23). */
export const BYTES_PER_TOKEN = 4;

/** What a file is before it was checked. */
export const UNCHECKED: FileFacts = { size: null, binary: false, missing: false };

let minted = 0;

/** An id for an item, unique in this page. */
export function itemId(): string {
  minted += 1;
  return `ctx-${String(Date.now())}-${String(minted)}`;
}

/** What one payload of the tree, the tabs or the editor adds — files, folders and a selection. */
export function itemsOfPayload(payload: FilesDragPayload): ContextItem[] {
  const entries: ContextItem[] = payload.entries.map((entry) =>
    entry.kind === 'directory'
      ? { id: itemId(), kind: 'folder', path: entry.path }
      : { id: itemId(), kind: 'file', path: entry.path, ...UNCHECKED },
  );

  const selection = payload.selection;
  if (selection !== undefined) {
    entries.push({
      id: itemId(),
      kind: 'range',
      path: selection.path,
      startLine: selection.range.startLine,
      endLine: selection.range.endLine,
      ...UNCHECKED,
    });
  }

  return entries;
}

/** What tells an item apart: two items with the same identity are one (S-220). */
function identityOf(item: ContextItem): string {
  switch (item.kind) {
    case 'range':
      return `range\n${item.path}\n${String(item.startLine)}\n${String(item.endLine)}`;
    case 'upload':
      return `upload\n${item.name}\n${String(item.size)}`;
    case 'text':
      return `text\n${item.source}\n${item.content}`;
    default:
      return `${item.kind}\n${item.path}`;
  }
}

function sameAs(left: ContextItem, right: ContextItem): boolean {
  return identityOf(left) === identityOf(right);
}

/** A range of a file that is already in the set whole adds nothing. */
function coveredBy(items: readonly ContextItem[], item: ContextItem): boolean {
  return (
    item.kind === 'range' && items.some((each) => each.kind === 'file' && each.path === item.path)
  );
}

/** What adding to the set did. */
export interface Merged {
  readonly items: readonly ContextItem[];
  readonly added: number;

  /** Already in the set, or covered by a file that is. */
  readonly duplicates: number;

  /** Past {@link MAX_CONTEXT_ITEMS}: left out, and said (S-235). */
  readonly overflow: number;
}

/**
 * The set with `incoming` added, in order: the same item twice is one, a range of a file that is
 * whole is nothing, a whole file takes the place of its ranges, and what passes the ceiling of items
 * is left out and counted (S-220, S-235).
 */
export function merged(current: readonly ContextItem[], incoming: readonly ContextItem[]): Merged {
  let items = [...current];
  let added = 0;
  let duplicates = 0;
  let overflow = 0;

  for (const item of incoming) {
    if (items.some((each) => sameAs(each, item)) || coveredBy(items, item)) {
      duplicates += 1;
      continue;
    }

    if (item.kind === 'file') {
      items = items.filter((each) => each.kind !== 'range' || each.path !== item.path);
    }

    if (items.length >= MAX_CONTEXT_ITEMS) {
      overflow += 1;
      continue;
    }

    items.push(item);
    added += 1;
  }

  return { items, added, duplicates, overflow };
}

/** What an item weighs, in bytes, as far as it is known — a folder and an unchecked file weigh 0. */
function bytesOf(item: ContextItem): number {
  switch (item.kind) {
    case 'file':
      return item.size ?? 0;
    case 'range':
      // A range is read whole by `Read` and then cut: what it may cost is the file's.
      return item.size ?? 0;
    case 'upload':
      return item.size;
    case 'text':
      return new TextEncoder().encode(item.content).length;
    default:
      return 0;
  }
}

/**
 * How big the set is, and whether it warns or refuses (D-23): past the share of the free window it
 * warns and still sends; past the ceiling of bytes or of items it does not send.
 *
 * @param freeTokens what is left of the window — of the session, or the draft's default
 */
export function totalsOf(
  items: readonly ContextItem[],
  limits: Pick<ComposerLimits, 'contextWarnFraction' | 'contextMaxBytes'>,
  freeTokens: number,
): ContextTotals {
  const bytes = items.reduce((sum, item) => sum + bytesOf(item), 0);
  const tokens = Math.ceil(bytes / BYTES_PER_TOKEN);
  const over = overOf(items.length, bytes, limits.contextMaxBytes);
  const warns = tokens > freeTokens * limits.contextWarnFraction;

  return {
    bytes,
    tokens,
    items: items.length,
    folders: items.filter((item) => item.kind === 'folder').length,
    level: over === null ? (warns ? 'warn' : 'ok') : 'over',
    over,
  };
}

function overOf(count: number, bytes: number, maxBytes: number): ContextTotals['over'] {
  if (count > MAX_CONTEXT_ITEMS) {
    return 'items';
  }

  return bytes > maxBytes ? 'bytes' : null;
}

/** A path of the tab's folder, absolute — what the backend checks in the session's folder. */
export function absoluteIn(folder: string, path: string): string {
  const base = folder.replace(/\/+$/, '');
  const relative = path.replace(/^\.?\/+/, '');

  if (relative === '' || relative === '.') {
    return base === '' ? '/' : base;
  }

  return `${base}/${relative}`;
}

/**
 * The set as `session.prompt.attachments` carries it — paths absolute, so a session of a subfolder
 * is checked against its own folder and refuses what is outside it (S-230). An upload still on its
 * way, or refused, is not sendable, and {@link unsendable} says so before anything leaves.
 */
export function attachmentsOf(
  folder: string,
  items: readonly ContextItem[],
): SessionPromptPayloadAttachmentsItem[] {
  return items.flatMap((item): SessionPromptPayloadAttachmentsItem[] => {
    switch (item.kind) {
      case 'file':
        return [{ kind: 'file', path: absoluteIn(folder, item.path) }];
      case 'range':
        return [
          {
            kind: 'file',
            path: absoluteIn(folder, item.path),
            range: { startLine: item.startLine, endLine: item.endLine },
          },
        ];
      case 'folder':
        return [{ kind: 'folder', path: absoluteIn(folder, item.path) }];
      case 'upload':
        return item.attachmentId === null
          ? []
          : [{ kind: 'upload', attachmentId: item.attachmentId }];
      default:
        return [{ kind: 'text', source: item.source, label: item.label, content: item.content }];
    }
  });
}

/** Why the set cannot be sent as it is — the first reason, or `null` when it can. */
export type Unsendable =
  | { readonly reason: 'missing'; readonly path: string }
  | { readonly reason: 'upload'; readonly name: string }
  | { readonly reason: 'over'; readonly over: 'items' | 'bytes' };

/**
 * @param pendingUploads whether an upload still to be sent may go — in a draft, whose uploads leave
 *   once the session it opens exists
 */
export function unsendable(
  items: readonly ContextItem[],
  totals: ContextTotals,
  pendingUploads = false,
): Unsendable | null {
  if (totals.over !== null) {
    return { reason: 'over', over: totals.over };
  }

  for (const item of items) {
    const blocked = blockedBy(item, pendingUploads);
    if (blocked !== null) {
      return blocked;
    }
  }

  return null;
}

/** What one item stands in the way of — a file gone, an upload refused or not sent yet. */
function blockedBy(item: ContextItem, pendingUploads: boolean): Unsendable | null {
  if ((item.kind === 'file' || item.kind === 'range') && item.missing) {
    return { reason: 'missing', path: item.path };
  }

  const stuck =
    item.kind === 'upload' &&
    (item.error !== null || (item.attachmentId === null && !pendingUploads));

  return stuck ? { reason: 'upload', name: item.name } : null;
}

/** The set without the items it is told to drop — by id. */
export function without(items: readonly ContextItem[], id: string): ContextItem[] {
  return items.filter((item) => item.id !== id);
}
