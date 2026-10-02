import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LIMITS,
  fetchCatalog,
  listMentionLevel,
  probeFile,
  uploadAttachment,
  uploadHeld,
} from '@/features/session/services/composer.service';
import { heldUpload, holdUpload } from '@/features/session/lib/pending-uploads';
import type { ContextItem, UploadItem } from '@/features/session/types/context';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

const FOLDER = '/srv/projects/app';

/** A response of `api.bytes`, as far as a probe reads it. */
function bytesAnswer(headers: Record<string, string>, size = 1) {
  return {
    status: 206,
    blob: new Blob([new Uint8Array(size)]),
    header: (name: string) => headers[name] ?? null,
  };
}

describe('fetchCatalog — plan 08, B-50, D-13', () => {
  it('asks for the folder, and reads the commands with their origin, the models and the ceilings — S-244', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      cliVersion: '2.1.277',
      commands: [{ name: 'init', origin: 'builtin', label: 'init', suggested: true }, 'odd'],
      models: [{ value: 'opus', displayName: 'Opus', description: '' }, 3],
      limits: {
        attachmentMaxBytes: 1_000,
        attachmentImageTypes: ['image/png', 4],
        contextWarnFraction: 0.5,
        draftWindowTokens: 100,
        contextMaxBytes: 2_000,
      },
    });

    const catalog = await fetchCatalog(FOLDER);

    expect(get).toHaveBeenCalledWith('/catalog?workspacePath=%2Fsrv%2Fprojects%2Fapp');
    expect(catalog.cliVersion).toBe('2.1.277');
    expect(catalog.commands.map((command) => [command.name, command.origin])).toEqual([
      ['init', 'builtin'],
    ]);
    expect(catalog.models.map((model) => model.value)).toEqual(['opus']);
    expect(catalog.limits).toEqual({
      attachmentMaxBytes: 1_000,
      attachmentImageTypes: ['image/png'],
      contextWarnFraction: 0.5,
      draftWindowTokens: 100,
      contextMaxBytes: 2_000,
    });
  });

  it('falls back to the defaults for what it cannot read', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ limits: { attachmentMaxBytes: -1 } });

    expect(await fetchCatalog(FOLDER)).toEqual({
      cliVersion: null,
      commands: [],
      models: [],
      limits: DEFAULT_LIMITS,
    });
    vi.spyOn(api, 'get').mockResolvedValue('nonsense');
    expect((await fetchCatalog(FOLDER)).limits).toEqual(DEFAULT_LIMITS);
  });
});

describe('uploadAttachment — plan 08, B-45', () => {
  it('sends the name and the file as a form, and reads what the server holds — S-206', async () => {
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({
      status: 201,
      body: { attachmentId: 'att_1', kind: 'image', mediaType: 'image/png', size: 9 },
    });
    const file = new File([new Uint8Array(9)], 'shot.png', { type: 'image/png' });

    expect(await uploadAttachment('s/1', file)).toEqual({
      attachmentId: 'att_1',
      kind: 'image',
      mediaType: 'image/png',
      size: 9,
    });
    const [path, form] = upload.mock.calls[0] ?? [];
    expect(path).toBe('/sessions/s%2F1/attachments');
    expect((form as FormData).get('name')).toBe('shot.png');
    expect((form as FormData).get('file')).toBeInstanceOf(File);
  });

  it('reads an odd answer as a text with what the browser knew', async () => {
    vi.spyOn(api, 'upload').mockResolvedValue({ status: 201, body: null });
    const file = new File(['abc'], 'n.txt', { type: 'text/plain' });

    expect(await uploadAttachment('s', file)).toEqual({
      attachmentId: '',
      kind: 'text',
      mediaType: 'text/plain',
      size: 3,
    });
  });
});

describe('listMentionLevel — plan 08, B-48', () => {
  it('lists a level of the folder, and never offers a link that leads out nor a name that is not text — S-230', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      path: 'src',
      truncated: true,
      entries: [
        { path: 'src/a.ts', name: 'a.ts', kind: 'file' },
        { path: 'src/lib', name: 'lib', kind: 'directory' },
        { path: 'src/out', name: 'out', kind: 'symlink', outside: true },
        { path: 'src/odd', name: 'odd', kind: 'file', unreadableName: true },
        { path: 'src/fifo', name: 'fifo', kind: 'other' },
        { name: 'nameless' },
        'junk',
      ],
    });

    const level = await listMentionLevel(FOLDER, 'src');

    expect(get).toHaveBeenCalledWith('/files/tree?folder=%2Fsrv%2Fprojects%2Fapp&path=src');
    expect(level).toEqual({
      truncated: true,
      entries: [
        { path: 'src/a.ts', name: 'a.ts', kind: 'file' },
        { path: 'src/lib', name: 'lib', kind: 'folder' },
      ],
    });
  });

  it('reads a body it cannot read as an empty level', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(null);

    expect(await listMentionLevel(FOLDER, '')).toEqual({ entries: [], truncated: false });
  });
});

describe('probeFile — plan 08, S-223, S-224', () => {
  it('reads the size of a text from the range, by its first byte', async () => {
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(
      bytesAnswer({
        'content-type': 'text/plain; charset=utf-8',
        'content-range': 'bytes 0-0/1234',
      }),
    );

    expect(await probeFile(FOLDER, 'a.ts')).toEqual({ size: 1234, binary: false, missing: false });
    expect(bytes).toHaveBeenCalledWith('/files/raw?folder=%2Fsrv%2Fprojects%2Fapp&path=a.ts', {
      headers: { range: 'bytes=0-0' },
    });
  });

  it('takes an image as something Claude reads, and a binary as something it does not', async () => {
    vi.spyOn(api, 'bytes').mockResolvedValueOnce(bytesAnswer({ 'content-type': 'image/png' }, 3));
    expect(await probeFile(FOLDER, 'a.png')).toEqual({ size: 3, binary: false, missing: false });

    vi.spyOn(api, 'bytes').mockResolvedValueOnce(
      bytesAnswer({ 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-0/9' }),
    );
    expect(await probeFile(FOLDER, 'a.bin')).toEqual({ size: 9, binary: true, missing: false });
  });

  it('takes a file whose type the server does not say as one Claude does not read', async () => {
    vi.spyOn(api, 'bytes').mockResolvedValueOnce(bytesAnswer({}, 2));

    expect(await probeFile(FOLDER, 'odd')).toEqual({ size: 2, binary: true, missing: false });
  });

  it('reads an empty file, a file gone, and lets any other failure through', async () => {
    const failing = (code: string) => new AppError(code, 'x', 'trace');

    vi.spyOn(api, 'bytes').mockRejectedValueOnce(failing('RANGE_NOT_SATISFIABLE'));
    expect(await probeFile(FOLDER, 'empty')).toEqual({ size: 0, binary: false, missing: false });

    vi.spyOn(api, 'bytes').mockRejectedValueOnce(failing('FILE_NOT_FOUND'));
    expect(await probeFile(FOLDER, 'gone')).toEqual({ size: null, binary: false, missing: true });

    const offline = failing('NETWORK_UNREACHABLE');
    vi.spyOn(api, 'bytes').mockRejectedValueOnce(offline);
    await expect(probeFile(FOLDER, 'x')).rejects.toBe(offline);
  });
});

describe('uploadHeld — plan 08, B-45', () => {
  const pending = (id: string): UploadItem => ({
    id,
    kind: 'upload',
    name: `${id}.txt`,
    mediaType: 'text/plain',
    size: 1,
    uploadKind: 'text',
    attachmentId: null,
    error: null,
  });

  it('uploads what the draft held, marks what was refused, and leaves the rest — S-236', async () => {
    const folderItem: ContextItem = { id: 'd', kind: 'folder', path: 'src' };
    holdUpload('ok', new File(['a'], 'ok.txt'));
    holdUpload('no', new File(['b'], 'no.txt'));
    const refusal = new AppError('ATTACHMENT_TYPE_UNSUPPORTED', 'x', 't');
    vi.spyOn(api, 'upload')
      .mockResolvedValueOnce({ status: 201, body: { attachmentId: 'att_ok', kind: 'text' } })
      .mockRejectedValueOnce(refusal);

    const items = await uploadHeld(
      [folderItem, pending('ok'), pending('no'), pending('gone')],
      's1',
    );

    expect(items).toEqual([
      folderItem,
      { ...pending('ok'), attachmentId: 'att_ok' },
      { ...pending('no'), error: refusal },
      pending('gone'),
    ]);
    expect(heldUpload('ok')).toBeUndefined();
    expect(heldUpload('no')).toBeDefined();
  });
});
