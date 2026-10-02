/**
 * The files dropped from the desktop into a draft, held in this page until the draft's session
 * exists and they can be uploaded to it (plan 08, B-45, B-49). In memory only: a `File` is not
 * something a reload can give back, nor something to write anywhere (D-22).
 */
const held = new Map<string, File>();

/** Holds the file of an item of the context. */
export function holdUpload(itemId: string, file: File): void {
  held.set(itemId, file);
}

/** The file of an item, if this page still holds it. */
export function heldUpload(itemId: string): File | undefined {
  return held.get(itemId);
}

/** Lets the file of an item go — it was uploaded, or the item was removed. */
export function releaseUpload(itemId: string): void {
  held.delete(itemId);
}
