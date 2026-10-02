import type { Readable } from 'node:stream';
import busboy from 'busboy';
import type { Busboy } from 'busboy';
import type { Request } from 'express';

import type { UploadPart, UploadParts } from '@application/files';
import { InputValidationError } from '@shared/errors/input-validation.error';

/**
 * The largest field the form may carry: the manifest, which is metadata — a path and a size per
 * item. Ten thousand items of long paths fit; a field past it is cut, and its JSON then refused.
 */
export const MANIFEST_MAX_BYTES = 4 * 1024 * 1024;

/** The fields an upload sends before its parts — `folder`, `directory`, `manifest`, `confirmSensitive`. */
const MAX_FIELDS = 8;

/** How far the parser reads: past these, what arrives is thrown away by it, never kept. */
export interface MultipartLimits {
  /** The largest file of an upload; a part past it is cut one byte later. */
  readonly fileBytes: number;
  /** The most files of an upload. */
  readonly files: number;
}

/**
 * The body of `POST /files/upload`, read **as a stream** by `busboy` — never held whole
 * (plan 07, B-49, [D-16](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)).
 *
 * The fields come first, and {@link open} returns once they are all in — at the first file part, or
 * at the end of a body that has none — so the manifest is checked whole before a byte is written.
 * Then the parts are handed out one at a time, in order: `busboy` does not read past a part nobody
 * reads, so at most one part is ever buffered, by the stream's own high-water mark.
 *
 * A client that goes away halfway is the parser destroyed: the part being read ends early, and so
 * does the body — the use case sees fewer bytes than declared and leaves nothing behind (S-305).
 * Nothing here throws once the parts start: a broken body is a body that ended.
 */
export class MultipartUpload implements UploadParts {
  /** The fields as they arrived, before the first part. */
  readonly fields: Record<string, string> = {};

  private readonly waiting: UploadPart[] = [];
  private wake: (() => void) | null = null;
  private partsStarted = false;
  private ended = false;

  private constructor(
    private readonly request: Request,
    private readonly parser: Busboy,
  ) {
    parser.on('field', (name, value) => {
      if (!this.partsStarted) {
        this.fields[name] = value;
      }
    });
    parser.on('file', (name, stream) => {
      this.partsStarted = true;

      if (name === 'file') {
        this.waiting.push(new BusboyPart(stream));
      } else {
        stream.resume();
      }

      this.woken();
    });
    parser.on('close', () => {
      this.finished();
    });
    parser.on('error', () => {
      this.finished();
    });
    request.on('close', () => {
      if (!request.complete) {
        parser.destroy(new Error('the request was cut before its end'));
      }
    });
  }

  /**
   * Starts reading a request, and answers once its fields are in.
   *
   * @throws {InputValidationError} not a multipart body at all
   */
  static async open(request: Request, limits: MultipartLimits): Promise<MultipartUpload> {
    const upload = new MultipartUpload(request, parserOf(request, limits));

    request.pipe(upload.parser);
    await upload.fieldsIn();

    return upload;
  }

  async next(): Promise<UploadPart | null> {
    for (;;) {
      const part = this.waiting.shift();

      if (part !== undefined) {
        return part;
      }

      if (this.ended) {
        return null;
      }

      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  /**
   * Stops reading: the parser is let go, and what is left of the body is drained — read and thrown
   * away — so the answer reaches a client still sending, rather than a connection reset.
   */
  release(): void {
    this.request.unpipe(this.parser);
    this.parser.destroy();
    this.request.resume();
  }

  /** Resolves at the first part, or at the end of the body — when no field can arrive any more. */
  private async fieldsIn(): Promise<void> {
    while (!this.partsStarted && !this.ended) {
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private finished(): void {
    this.ended = true;
    this.woken();
  }

  private woken(): void {
    const wake = this.wake;

    this.wake = null;
    wake?.();
  }
}

/** One part, read a chunk at a time — and a part cut short simply ends. */
class BusboyPart implements UploadPart {
  private readonly chunks: AsyncIterator<Buffer>;
  private done = false;

  constructor(stream: Readable) {
    this.chunks = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  }

  async next(): Promise<Uint8Array | null> {
    if (this.done) {
      return null;
    }

    try {
      const read = await this.chunks.next();

      this.done = read.done === true;
      return this.done ? null : read.value;
    } catch {
      // The connection dropped, or the body ended inside the part: what arrived is all there is.
      this.done = true;
      return null;
    }
  }

  async skip(): Promise<void> {
    while ((await this.next()) !== null) {
      // Thrown away: the next part is behind this one.
    }
  }
}

/** @throws {InputValidationError} the request is not `multipart/form-data` */
function parserOf(request: Request, limits: MultipartLimits): Busboy {
  try {
    return busboy({
      headers: request.headers,
      limits: {
        fields: MAX_FIELDS,
        fieldSize: MANIFEST_MAX_BYTES,
        fileSize: limits.fileBytes + 1,
        files: limits.files,
      },
    });
  } catch {
    throw new InputValidationError([{ field: 'body', rule: 'multipart' }]);
  }
}
