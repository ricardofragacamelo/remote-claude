import fs from 'node:fs';

import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

/**
 * What a zip the product handed out holds — read back with a reader of its own, never with the code
 * that wrote it: every file by its name in the zip, and its content as text. The folders are
 * listed apart, as the names a zip gives them (ending in `/`).
 */
export interface ZipContents {
  readonly files: Readonly<Record<string, string>>;
  readonly folders: readonly string[];
}

/** The bytes of one entry, read whole. */
function contentOf(zip: ZipFile, entry: Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null) {
        reject(error);
        return;
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
  });
}

/** Reads every entry of the zip at `file`, one after the other. */
export function readZip(file: string): Promise<ZipContents> {
  const bytes = fs.readFileSync(file);

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error !== null) {
        reject(error);
        return;
      }

      const files: Record<string, string> = {};
      const folders: string[] = [];

      zip.on('error', reject);
      zip.on('end', () => {
        resolve({ files, folders });
      });
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName.endsWith('/')) {
          folders.push(entry.fileName);
          zip.readEntry();
          return;
        }

        contentOf(zip, entry).then((content) => {
          files[entry.fileName] = content;
          zip.readEntry();
        }, reject);
      });
      zip.readEntry();
    });
  });
}
