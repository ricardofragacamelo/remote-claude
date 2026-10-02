import type { FolderDisk } from '@application/files';

/**
 * A disk that answers only what a test told it to, and fails loudly on anything else — so a use
 * case that reaches for a call the scenario did not expect says so instead of passing by accident.
 */
export function stubFolderDisk(answers: Partial<FolderDisk>): FolderDisk {
  const unexpected = (name: string) => (): Promise<never> =>
    Promise.reject(new Error(`the disk was not expected to ${name}`));

  return {
    list: unexpected('list'),
    read: unexpected('read'),
    version: unexpected('version'),
    inspect: unexpected('inspect'),
    locate: (entry) => Promise.resolve(entry.absolute),
    write: unexpected('write'),
    create: unexpected('create'),
    move: unexpected('move'),
    copy: unexpected('copy'),
    count: unexpected('count'),
    remove: unexpected('remove'),
    openRaw: unexpected('openRaw'),
    survey: unexpected('survey'),
    archive: unexpected('archive'),
    stage: unexpected('stage'),
    ...answers,
  };
}
