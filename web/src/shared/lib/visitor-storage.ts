import { logger } from '@/shared/logging/logger';

/** The part of a `Storage` this module uses. Narrow, so a test can hand in one that throws. */
export type VisitorStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Where the storage comes from. Reading `localStorage` itself can throw — a blocked origin does. */
export type StorageSource = () => VisitorStorage;

/**
 * Every key of this module starts with it, so what a visitor keeps is findable in one place — and
 * nothing a sign-in holds ever shares the namespace (docs/architecture/web/07-auth.md).
 */
export const VISITOR_PREFIX = 'rc.visitor.';

const browserStorage: StorageSource = () => globalThis.localStorage;

/**
 * A convenience of this browser — the theme, the size of a panel, whether the help was open.
 *
 * **Never** a credential, and never state that has to survive: a private window, a full quota or a
 * blocked origin throws, and the answer then is the default, never a broken screen
 * (docs/architecture/web/04-state-and-data.md#estado-de-aba-de-pasta). A value from an older version
 * or written by hand that `parse` does not recognise is the default too.
 *
 * @param parse the value as JSON gave it back, or `undefined` for "not one of mine"
 */
export function readVisitor<T>(
  key: string,
  parse: (value: unknown) => T | undefined,
  storage: StorageSource = browserStorage,
): T | undefined {
  try {
    const raw = storage().getItem(VISITOR_PREFIX + key);

    return raw === null ? undefined : parse(JSON.parse(raw));
  } catch (error) {
    logger.debug(
      { op: 'storage.read', key, outcome: 'unavailable', err: String(error) },
      'visitor storage unreadable — using the default',
    );
    return undefined;
  }
}

/**
 * Forgets a convenience of this browser — what "restore the default" means for a choice whose
 * default follows something else, as the language follows the browser's.
 */
export function forgetVisitor(
  key: string,
  storage: () => Pick<Storage, 'removeItem'> = () => globalThis.localStorage,
): void {
  try {
    storage().removeItem(VISITOR_PREFIX + key);
  } catch (error) {
    logger.debug(
      { op: 'storage.remove', key, outcome: 'refused', err: String(error) },
      'visitor storage refused a removal — forgotten for this page only',
    );
  }
}

/** Keeps a convenience of this browser — or, when the browser refuses, carries on without it. */
export function writeVisitor(
  key: string,
  value: unknown,
  storage: StorageSource = browserStorage,
): void {
  try {
    storage().setItem(VISITOR_PREFIX + key, JSON.stringify(value));
  } catch (error) {
    logger.debug(
      { op: 'storage.write', key, outcome: 'refused', err: String(error) },
      'visitor storage refused a write — kept for this page only',
    );
  }
}
