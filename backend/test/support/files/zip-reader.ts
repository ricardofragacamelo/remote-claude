import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

/** What a zip holds: each entry's name, and the bytes of a file — `null` for a folder. */
export type ZipContents = ReadonlyMap<string, Buffer | null>;

/**
 * Reads a whole zip from memory with `yauzl` — the other library of the pair, so the suite does not
 * check `yazl`'s output with `yazl`'s own idea of what a zip is. Rejects a zip that is cut or
 * malformed, which is how a test tells a valid zip from a stream that stopped halfway.
 */
export function readZip(buffer: Buffer): Promise<ZipContents> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error !== null) {
        reject(error);
        return;
      }

      collect(zip, resolve, reject);
    });
  });
}

function collect(
  zip: ZipFile,
  resolve: (contents: ZipContents) => void,
  reject: (error: Error) => void,
): void {
  const contents = new Map<string, Buffer | null>();

  zip.on('error', reject);
  zip.on('end', () => {
    resolve(contents);
  });
  zip.on('entry', (entry: Entry) => {
    if (entry.fileName.endsWith('/')) {
      contents.set(entry.fileName, null);
      zip.readEntry();
      return;
    }

    zip.openReadStream(entry, (error, stream) => {
      if (error !== null) {
        reject(error);
        return;
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => {
        contents.set(entry.fileName, Buffer.concat(chunks));
        zip.readEntry();
      });
    });
  });
  zip.readEntry();
}
