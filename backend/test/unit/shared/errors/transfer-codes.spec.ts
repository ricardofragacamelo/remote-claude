import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RangeNotSatisfiableError, UploadSizeMismatchError } from '@domain/files';
import { contentRangeFor, httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

const repository = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (relative: string): string => readFileSync(path.join(repository, relative), 'utf8');

/** A key of a catalogue of the web, by its dotted path — `undefined` when it is not there. */
function keyOf(catalogue: string, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      JSON.parse(read(`web/src/shared/i18n/locales/${catalogue}`)) as unknown,
    );
}

/** The codes and the contract of previews and transfer — plan 07, B-47. */
describe('the contract of previews and transfer — S-292', () => {
  const errors = [
    new RangeNotSatisfiableError('a.bin', 10),
    new UploadSizeMismatchError('a', 3, 2),
  ];

  it('answers a range past the end with 416, as doc 04 declares it', () => {
    const rows = read('docs/architecture/shared/04-errors-and-http.md');

    expect(httpStatusFor('RANGE_NOT_SATISFIABLE')).toBe(416);
    expect(rows).toMatch(/^\| `RANGE_NOT_SATISFIABLE` \| 416 \|/m);
    expect(rows).toMatch(/^\| `416` \| `RANGE_NOT_SATISFIABLE` \|/m);
  });

  it.each(errors.map((error) => [error.messageKey, error] as const))(
    'translates %s in both languages of the web',
    (messageKey) => {
      expect(keyOf('en.json', messageKey)).toEqual(expect.any(String));
      expect(keyOf('pt-BR.json', messageKey)).toEqual(expect.any(String));
    },
  );

  it('says the size a 416 found, for the Content-Range of the answer', () => {
    const envelope = toErrorEnvelope(new RangeNotSatisfiableError('a.bin', 10), 't');

    expect(envelope.error).toMatchObject({
      code: 'RANGE_NOT_SATISFIABLE',
      messageKey: 'files.error.rangeNotSatisfiable',
      params: { path: 'a.bin', size: 10 },
      httpEquivalent: 416,
    });
    expect(contentRangeFor(envelope)).toBe('bytes */10');
  });

  it('puts no Content-Range on any other refusal', () => {
    expect(
      contentRangeFor(toErrorEnvelope(new UploadSizeMismatchError('a', 3, 2), 't')),
    ).toBeNull();
    expect(
      contentRangeFor({
        error: {
          code: 'RANGE_NOT_SATISFIABLE',
          messageKey: 'x',
          traceId: 't',
          httpEquivalent: 416,
        },
      }),
    ).toBeNull();
  });

  it('documents the routes of the transfer in backend/03', () => {
    const modules = read('docs/architecture/backend/03-modules.md');

    for (const route of [
      'GET /files/limits',
      'GET /files/raw?folder=&path=&download=',
      'GET /files/archive?folder=&path=',
      'POST /files/upload/preflight',
      'POST /files/upload',
    ]) {
      expect(modules).toContain(`| \`${route}`);
    }
  });

  it('has the trail take a download — the kind of migration 0017', () => {
    const migration = read(
      'backend/src/infrastructure/database/migrations/0017_file_downloads.sql',
    );

    expect(migration).toContain("'file.downloaded'");
    expect(keyOf('en.json', 'audit.fileAct.downloaded')).toEqual(expect.any(String));
    expect(keyOf('pt-BR.json', 'audit.fileAct.downloaded')).toEqual(expect.any(String));
  });
});
