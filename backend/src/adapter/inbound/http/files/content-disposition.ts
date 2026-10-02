/**
 * A `Content-Disposition` for a file of the user's — plan 07, B-48.
 *
 * `inline` only for what the preview list allows, `attachment` for everything else and for every
 * download ([07 · D-18](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)).
 * The name goes twice, as RFC 6266 has it: an ASCII fallback in `filename` — every character that
 * could end the quoted string or be decoded by a browser (`"`, `\`, `%`) and everything outside
 * printable ASCII replaced — and the exact name in `filename*`, percent-encoded as UTF-8. A name is
 * a header's worth of text from a disk, never a way to add another header.
 */
export function dispositionOf(kind: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');

  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodedName(name)}`;
}

/** RFC 5987: `encodeURIComponent` leaves `'`, `(`, `)` and `*`, which the grammar does not allow. */
function encodedName(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
