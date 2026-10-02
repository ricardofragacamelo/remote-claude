import type { UploadCandidate } from '../types/transfer';

/**
 * The files a person hands the Explorer — dropped from the desktop, or picked in the browser's own
 * dialog — each with where it goes under the destination, folders kept (B-52). A folder dropped is
 * walked through the entries API the browsers share; a link inside it arrives as the file it points
 * to, which is what the server treats it as.
 */

/** A path of an entry of a drop, without the `/` its full path starts with. */
function relative(fullPath: string): string {
  return fullPath.replace(/^\/+/, '');
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/** One batch of a directory's entries — the reader gives them a batch at a time, and `[]` at the end. */
function batchOf(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];

  for (let batch = await batchOf(reader); batch.length > 0; batch = await batchOf(reader)) {
    children.push(...batch);
  }

  return children;
}

function isFile(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectory(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

/** Every file under an entry of a drop, in the order the reader gives them. */
async function filesUnder(entry: FileSystemEntry): Promise<UploadCandidate[]> {
  if (isFile(entry)) {
    return [{ file: await fileOf(entry), path: relative(entry.fullPath) }];
  }

  if (!isDirectory(entry)) {
    return [];
  }

  const nested = await Promise.all((await childrenOf(entry)).map(filesUnder));
  return nested.flat();
}

/**
 * What a drop from the desktop carries. The entries are taken **at once** — a drop's items stop
 * existing when its handler returns — and walked after; a browser without the entries API gives its
 * plain files.
 */
export function readDrop(transfer: DataTransfer): Promise<UploadCandidate[]> {
  const entries = [...transfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);

  if (entries.length === 0 || entries.some((entry) => entry === null)) {
    return Promise.resolve([...transfer.files].map((file) => ({ file, path: file.name })));
  }

  return Promise.all(entries.map((entry) => filesUnder(entry as FileSystemEntry))).then((all) =>
    all.flat(),
  );
}

/**
 * What the browser's dialog picked: files by their names, or a folder with every file under it — its
 * `webkitRelativePath` starts with the folder's own name, which is kept.
 */
export function readPicked(files: FileList | readonly File[]): UploadCandidate[] {
  return [...files].map((file) => {
    // Absent where the browser has no directory picker; empty for a file picked on its own.
    const relative = file.webkitRelativePath as string | undefined;
    return { file, path: relative === undefined || relative === '' ? file.name : relative };
  });
}

/** Whether a drag carries files from outside the page — the desktop, another application. */
export function carriesDesktopFiles(transfer: DataTransfer): boolean {
  return [...transfer.types].includes('Files');
}
