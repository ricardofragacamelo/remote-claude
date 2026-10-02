import { editorStoreOf, updateDoc } from '../store/editor.store';
import { reloadFromDisk } from './documents';
import { recreate, save } from './saving';
import { openDiff } from './tabs';

/**
 * The answers to the questions the editor asks about one file — the conflict, the change on disk,
 * the second step, the file deleted under its tab. Each one decides; none of them guesses.
 */

/** "Compare": the disk beside the buffer, in a diff tab — and the question waits above the editor. */
export function compareWithDisk(folder: string, path: string): void {
  const store = editorStoreOf(folder);

  updateDoc(store, path, (doc) => ({
    conflict: doc.conflict === null ? null : { ...doc.conflict, asking: false },
  }));
  openDiff(folder, { path, source: 'disk' }, { path, source: 'buffer' });
}

/**
 * "Overwrite": the buffer saved over the version the `412` brought — on purpose, and only over that
 * one: if the disk changed again meanwhile, the answer is a new `412`, never a blind write (S-229).
 * A file deleted meanwhile is offered to be recreated instead.
 */
export async function overwrite(folder: string, path: string): Promise<void> {
  const store = editorStoreOf(folder);
  const conflict = store.getState().docs[path]?.conflict;

  if (conflict === undefined || conflict === null) {
    return;
  }

  updateDoc(store, path, () => ({ conflict: null }));

  if (conflict.currentEtag === null) {
    updateDoc(store, path, () => ({ deleted: true, recreateAsked: true }));
    return;
  }

  await save(folder, path, { overwrite: conflict.currentEtag });
}

/** "Reload": the buffer dropped, the disk's version read — the person's changes are discarded. */
export async function discardAndReload(folder: string, path: string): Promise<void> {
  updateDoc(editorStoreOf(folder), path, () => ({ conflict: null, external: null }));
  await reloadFromDisk(folder, path);
}

/** The conflict dialog closed without an answer: the question stays above the editor. */
export function postponeConflict(folder: string, path: string): void {
  updateDoc(editorStoreOf(folder), path, (doc) => ({
    conflict: doc.conflict === null ? null : { ...doc.conflict, asking: false },
  }));
}

/** The conflict asked again, from above the editor. */
export function askConflict(folder: string, path: string): void {
  updateDoc(editorStoreOf(folder), path, (doc) => ({
    conflict: doc.conflict === null ? null : { ...doc.conflict, asking: true },
  }));
}

/** "Keep my changes": the warning of a change on disk goes; the next save meets the `412` (S-239). */
export function keepMine(folder: string, path: string): void {
  updateDoc(editorStoreOf(folder), path, () => ({ external: null }));
}

/**
 * A question of a file answered: put away, and — confirmed — what it asked about done.
 *
 * @param asked the flag of the question, which goes back to `false`
 */
async function answer(
  folder: string,
  path: string,
  asked: 'sensitiveAsked' | 'recreateAsked',
  confirmed: boolean,
  then: () => Promise<unknown>,
): Promise<void> {
  updateDoc(editorStoreOf(folder), path, () => ({ [asked]: false }));

  if (confirmed) {
    await then();
  }
}

/** The second step answered: saved with the confirmation — or, cancelled, nothing sent (S-232). */
export function answerSensitive(folder: string, path: string, confirmed: boolean): Promise<void> {
  return answer(folder, path, 'sensitiveAsked', confirmed, () =>
    save(folder, path, { confirmSensitive: true }),
  );
}

/** "Recreate it?" answered: the file written again with a create — or left deleted (S-240). */
export function answerRecreate(folder: string, path: string, confirmed: boolean): Promise<void> {
  return answer(folder, path, 'recreateAsked', confirmed, () => recreate(folder, path, true));
}

/** The error of the last save, dismissed — the buffer stays dirty. */
export function dismissSaveError(folder: string, path: string): void {
  updateDoc(editorStoreOf(folder), path, () => ({ saveError: null }));
}

/** "The previous version was not kept in the history", read — the save itself went through. */
export function dismissHistoryNotice(folder: string, path: string): void {
  updateDoc(editorStoreOf(folder), path, () => ({ historyNotKept: null }));
}
