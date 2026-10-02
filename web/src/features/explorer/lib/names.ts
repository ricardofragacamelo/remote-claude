/**
 * Why a name typed for a new entry, or for a rename, cannot be sent — checked **before** the request,
 * so the person reads the reason beside what they typed (S-171). The server checks again: this is a
 * convenience, the fence is there.
 */
export type NameProblem = 'empty' | 'reserved' | 'separator' | 'control' | 'tooLong' | 'exists';

/** What a file system holds as one name at most, in bytes. */
export const MAX_NAME_BYTES = 255;

/** Whether a character is a NUL, or any other control character, which no editor can show back. */
function isControl(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

/**
 * The first reason `name` cannot be one, or `null` when it can.
 *
 * @param taken whether the folder it goes into already has an entry by that name — as far as the tree
 *   knows; a name taken meanwhile is the server's `409`
 */
export function nameProblem(name: string, taken: (name: string) => boolean): NameProblem | null {
  if (name.trim() === '') {
    return 'empty';
  }

  if (name === '.' || name === '..') {
    return 'reserved';
  }

  if (name.includes('/') || name.includes('\\')) {
    return 'separator';
  }

  if ([...name].some(isControl)) {
    return 'control';
  }

  if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) {
    return 'tooLong';
  }

  return taken(name) ? 'exists' : null;
}

/** The message of each problem — named in full so the i18n check sees every key. */
export const NAME_PROBLEM_KEYS: Readonly<Record<NameProblem, string>> = {
  empty: 'explorer.name.empty',
  reserved: 'explorer.name.reserved',
  separator: 'explorer.name.separator',
  control: 'explorer.name.control',
  tooLong: 'explorer.name.tooLong',
  exists: 'explorer.name.exists',
};
