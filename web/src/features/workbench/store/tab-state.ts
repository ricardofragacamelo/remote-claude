import { isRecord } from '@/shared/lib/json';
import type { RegistryEntry } from '@/shared/lib/registry';
import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';

/**
 * One part of a folder tab that a reload gives back — the layout (plan 06), the open editors
 * (plan 07), the open conversation (plan 08). Registering is declaring what to keep and how to put
 * it back; the workbench decides when (docs/architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam).
 */
export interface TabRestorer<T = unknown> extends RegistryEntry {
  /**
   * The shape of what it keeps. A value kept under another version is not given back: the part
   * starts from its default, with no error (plan 06, S-135).
   */
  readonly version: number;

  /** A kept value, as far as it can be trusted — `undefined` for "start from the default". */
  parse(saved: unknown): T | undefined;

  /** What to keep of a folder's tab, now. */
  capture(path: string): T;

  /** Puts a kept value back, when the folder's tab is made — before anything of it is on screen. */
  apply(path: string, value: T): void;

  /** Told whenever what it keeps changed. Answers the way to stop. */
  subscribe(path: string, listener: () => void): () => void;

  /**
   * Drops what it holds in memory of a folder's tab — closed, or `null` for every tab: a sign-out,
   * a reload. Only a part with a store of its own needs it; what was kept is the workbench's to drop.
   */
  forget?(path: string | null): void;
}

/** Where every tab's kept state lives, by the folder's **real** path. */
const TAB_STATE_KEY = 'workbench.tabState';

/** The shape of the whole record; another one is an older version, and is dropped. */
const FORMAT = 1;

/** What one part of one tab keeps, and under which version of the part. */
interface KeptPart {
  readonly version: number;
  readonly state: unknown;
}

type KeptTabs = Readonly<Record<string, Readonly<Record<string, KeptPart>>>>;

function isKeptPart(value: unknown): value is KeptPart {
  return isRecord(value) && typeof value['version'] === 'number' && 'state' in value;
}

/** The record as far as it can be trusted: anything unreadable is a tab with nothing kept. */
function keptFrom(value: unknown): KeptTabs | undefined {
  if (!isRecord(value) || value['format'] !== FORMAT || !isRecord(value['tabs'])) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value['tabs']).flatMap(([path, parts]) =>
      isRecord(parts)
        ? [[path, Object.fromEntries(Object.entries(parts).filter(([, part]) => isKeptPart(part)))]]
        : [],
    ),
  ) as KeptTabs;
}

function readKept(): KeptTabs {
  return readVisitor(TAB_STATE_KEY, keptFrom) ?? {};
}

function writeKept(tabs: KeptTabs): void {
  writeVisitor(TAB_STATE_KEY, { format: FORMAT, tabs });
}

/** The listeners each live tab has on its parts. */
const live = new Map<string, () => void>();

/** What a tab keeps now, part by part. */
function captured(path: string, restorers: readonly TabRestorer[]): Record<string, KeptPart> {
  return Object.fromEntries(
    restorers.map((restorer) => [
      restorer.id,
      { version: restorer.version, state: restorer.capture(path) },
    ]),
  );
}

/** Keeps a tab's state — only when it changed, so typing in a prompt writes nothing. */
function keep(path: string, restorers: readonly TabRestorer[]): void {
  const kept = readKept();
  const now = captured(path, restorers);

  if (JSON.stringify(kept[path]) !== JSON.stringify(now)) {
    writeKept({ ...kept, [path]: now });
  }
}

/**
 * Gives a folder's tab back what it kept, then keeps what changes from now on.
 *
 * Each part is given back only when it was kept under its own version and reads as one of its
 * values; anything else leaves the part at its default, with no error (S-135). A convenience of
 * this browser, never the server's: the layout of a phone is not the one of a desktop
 * ([06 · D-10](../../../../../docs/plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)).
 */
export function restoreTab(path: string, restorers: readonly TabRestorer[]): void {
  const kept = readKept()[path] ?? {};

  for (const restorer of restorers) {
    const part = kept[restorer.id];
    const value = part?.version === restorer.version ? restorer.parse(part.state) : undefined;

    if (value !== undefined) {
      restorer.apply(path, value);
    }
  }

  live.get(path)?.();
  const stops = restorers.map((restorer) =>
    restorer.subscribe(path, () => {
      keep(path, restorers);
    }),
  );
  live.set(path, () => {
    for (const stop of stops) {
      stop();
    }
  });
}

/** Stops keeping a tab's state, and — unless it is only let go of in memory — drops what it kept. */
export function forgetTab(path: string, { kept = true }: { readonly kept?: boolean } = {}): void {
  live.get(path)?.();
  live.delete(path);

  if (!kept) {
    return;
  }

  const tabs = readKept();

  if (path in tabs) {
    writeKept(Object.fromEntries(Object.entries(tabs).filter(([each]) => each !== path)));
  }
}

/** Stops keeping every tab's state; `kept: true` drops what they kept too — somebody signed out. */
export function forgetTabs({ kept }: { readonly kept: boolean }): void {
  for (const stop of live.values()) {
    stop();
  }
  live.clear();

  if (kept) {
    writeKept({});
  }
}

/**
 * Drops what a folder that is no longer open kept: closed in another window, or on another device.
 * Its tab, opened again, starts from the default (S-135).
 */
export function pruneTabs(open: readonly string[]): void {
  const tabs = readKept();
  const remaining = Object.fromEntries(
    Object.entries(tabs).filter(([path]) => open.includes(path)),
  );

  if (Object.keys(remaining).length !== Object.keys(tabs).length) {
    writeKept(remaining);
  }
}
