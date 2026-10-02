/**
 * The name "Duplicate" gives a copy: `name copy.ext`, then `name copy 2.ext`, … — the first one the
 * folder does not have (S-103).
 *
 * The web picks it ([07 · B-14](../../../../../docs/plans/07-explorer-and-editor/F2-file-write.md#b-14--copiar-e-duplicar-)), so the server never invents a name: the copy is an ordinary `POST /files/copy`
 * whose destination the person could have typed. Pure, so the rule is proved without a disk; a name
 * taken between the choice and the copy is the copy's `409`, never an overwrite.
 *
 * The extension is what follows the **last** dot, and a leading dot is part of the name, not an
 * extension: `.env` duplicates to `.env copy`, `archive.tar.gz` to `archive.tar copy.gz`.
 *
 * @param name the entry being duplicated
 * @param taken whether a name is already in the folder
 */
export function duplicateName(name: string, taken: (candidate: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];

  for (let attempt = 1; ; attempt += 1) {
    const candidate = `${stem} copy${attempt === 1 ? '' : ` ${String(attempt)}`}${extension}`;

    if (!taken(candidate)) {
      return candidate;
    }
  }
}
