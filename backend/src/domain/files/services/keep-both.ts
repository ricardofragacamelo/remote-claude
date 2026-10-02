import { MAX_SEGMENT_BYTES } from '../value-objects/file-path.value-object';

/**
 * How many names "keep both" tries before it gives up and answers `409` for the item: a folder
 * that already holds `a copy.txt` through `a copy 100.txt` is not one more copy away from working.
 */
export const KEEP_BOTH_ATTEMPTS = 100;

/**
 * The name an upload takes when the one it was sent under is taken and the person chose "keep
 * both" — `name copy.ext`, then `name copy 2.ext`, `name copy 3.ext`… — plan 07, B-49.
 *
 * The words of the explorer's own "copy" in VS Code and in the file managers people know. The
 * extension is the last one, so `notes.tar.gz` becomes `notes.tar copy.gz`; a name that starts with
 * its only dot (`.env`) has no extension, and becomes `.env copy`. The stem is shortened when the
 * result would not fit in one segment, so a long name still gets a copy rather than an error.
 * Each candidate is tried by the disk with `O_EXCL`, never assumed free.
 *
 * @param attempt 1 for the first copy
 */
export function keepBothName(name: string, attempt: number): string {
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const suffix = attempt === 1 ? ' copy' : ` copy ${String(attempt)}`;

  return `${fitted(stem, Buffer.byteLength(suffix + extension, 'utf8'))}${suffix}${extension}`;
}

/** The stem, cut a character at a time until it and `reserved` bytes fit in one segment. */
function fitted(stem: string, reserved: number): string {
  let characters = [...stem];

  while (
    characters.length > 0 &&
    Buffer.byteLength(characters.join(''), 'utf8') + reserved > MAX_SEGMENT_BYTES
  ) {
    characters = characters.slice(0, -1);
  }

  return characters.join('');
}
