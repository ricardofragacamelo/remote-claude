import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import type { Request } from 'express';

import type { UploadPart } from '@application/files';
import { MultipartUpload } from '@adapter/inbound/http/files/multipart-upload.reader';
import { InputValidationError } from '@shared/errors/input-validation.error';

const BOUNDARY = 'rc-spec-boundary';

/** A request that is a stream the spec writes the body into, piece by piece. */
function requestOf(contentType = `multipart/form-data; boundary=${BOUNDARY}`): PassThrough & {
  headers: Record<string, string>;
  complete: boolean;
} {
  return Object.assign(new PassThrough(), {
    headers: { 'content-type': contentType },
    complete: false,
  });
}

const field = (name: string, value: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

const filePart = (name: string, content: string): string =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"; filename="x"\r\n` +
  `Content-Type: application/octet-stream\r\n\r\n${content}\r\n`;

const END = `--${BOUNDARY}--\r\n`;

/** Everything a part carries, read the way the stage reads it. */
async function contentOf(part: UploadPart | null): Promise<string> {
  let content = '';

  for (
    let chunk = await part?.next();
    chunk !== null && chunk !== undefined;
    chunk = await part?.next()
  ) {
    content += Buffer.from(chunk).toString();
  }

  return content;
}

const LIMITS = { fileBytes: 1024, files: 10 };

/** The multipart body of an upload, read as a stream — plan 07, B-49. */
describe('MultipartUpload', () => {
  it('answers with the fields once the first part starts, and hands the parts out in order', async () => {
    const request = requestOf();
    // The first part ends where the next delimiter starts; the header of the second has not come.
    request.write(
      field('folder', '/srv/app') +
        field('manifest', '[]') +
        filePart('file', 'one') +
        `--${BOUNDARY}`,
    );

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);

    expect(upload.fields).toEqual({ folder: '/srv/app', manifest: '[]' });
    expect(await contentOf(await upload.next())).toBe('one');

    // The next part is asked for before the body carries it: it waits for it.
    const second = upload.next();
    request.end(
      `\r\nContent-Disposition: form-data; name="file"; filename="x"\r\n\r\ntwo\r\n${END}`,
    );
    request.complete = true;

    expect(await contentOf(await second)).toBe('two');
    expect(await upload.next()).toBeNull();
    upload.release();
  });

  it('ignores a field that comes after the parts started, and a part that is not a file', async () => {
    const request = requestOf();
    request.end(
      field('folder', '/a') +
        filePart('other', 'skipped') +
        field('late', 'x') +
        filePart('file', 'kept') +
        END,
    );

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);

    expect(upload.fields).toEqual({ folder: '/a' });
    expect(await contentOf(await upload.next())).toBe('kept');
    expect(await upload.next()).toBeNull();
  });

  it('answers a body with no part at all once it ends', async () => {
    const request = requestOf();
    request.end(field('folder', '/a') + END);

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);

    expect(upload.fields).toEqual({ folder: '/a' });
    expect(await upload.next()).toBeNull();
  });

  it('ends the part being read, and the body, when the connection is cut — S-305', async () => {
    const request = requestOf();
    request.write(field('folder', '/a') + filePart('file', 'half').replace(/\r\n$/, ''));

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);
    const part = await upload.next();
    const first = await part?.next();
    request.emit('close');

    expect(Buffer.from(first ?? new Uint8Array()).toString()).toBe('half');
    expect(await part?.next()).toBeNull();
    expect(await part?.next()).toBeNull();
    expect(await upload.next()).toBeNull();
  });

  it('lets a part be skipped, unread, to reach the next one', async () => {
    const request = requestOf();
    request.end(
      field('folder', '/a') + filePart('file', 'unread') + filePart('file', 'read') + END,
    );

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);
    await (await upload.next())?.skip();

    expect(await contentOf(await upload.next())).toBe('read');
  });

  it('cuts a part past the ceiling one byte later, never reading the rest', async () => {
    const request = requestOf();
    request.end(field('folder', '/a') + filePart('file', 'x'.repeat(20)) + END);

    const upload = await MultipartUpload.open(request as unknown as Request, {
      fileBytes: 4,
      files: 1,
    });

    expect(await contentOf(await upload.next())).toBe('xxxxx');
  });

  it('does not destroy a request that ended whole when it closes', async () => {
    const request = requestOf();
    request.end(field('folder', '/a') + filePart('file', 'ok') + END);
    request.complete = true;

    const upload = await MultipartUpload.open(request as unknown as Request, LIMITS);
    request.emit('close');

    expect(await contentOf(await upload.next())).toBe('ok');
  });

  it('refuses a body that is not multipart', async () => {
    await expect(
      MultipartUpload.open(requestOf('application/json') as unknown as Request, LIMITS),
    ).rejects.toBeInstanceOf(InputValidationError);
  });
});
