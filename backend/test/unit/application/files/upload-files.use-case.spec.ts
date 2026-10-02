import { describe, expect, it } from 'vitest';

import { UploadFilesUseCase } from '@application/files';
import type {
  ChunkSource,
  EntryInspection,
  FolderDisk,
  StagedFile,
  UploadCommand,
  UploadItem,
  UploadOutcome,
  UploadPart,
  UploadParts,
} from '@application/files';
import { UserId } from '@domain/auth';
import {
  Etag,
  FileChangedError,
  FileExistsError,
  FileTrailUnavailableError,
  UploadSizeMismatchError,
} from '@domain/files';
import type { FilePath } from '@domain/files';
import { aHistoryKeeper, InMemoryFileHistory } from '../../../support/fakes/in-memory-file-history';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { stubFolderDisk } from '../../../support/fakes/stub-folder-disk';
import { WRITING_FOLDER, aFileTrail, aFileWriting } from '../../../support/files/file-writing';

const owner = UserId.create('auth|42');
const LIMITS = {
  downloadMaxBytes: 1000,
  archiveMaxEntries: 10,
  uploadMaxBytes: 100,
  uploadMaxEntries: 10,
  uploadMaxTotalBytes: 500,
};
const etagOf = (text: string): Etag => Etag.of(Buffer.from(text));

/**
 * A disk in memory, as an upload touches it: what is where, the stage that reads a part whole, and
 * the order things happened in — so a spec can say the trail was told before the name was taken.
 */
class UploadDisk {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>(['']);
  readonly others = new Set<string>();
  readonly log: string[] = [];
  /** Names a `link` finds taken once, as if somebody had been faster. */
  readonly raced = new Set<string>();
  /** Somebody writes this over a file between the check and the `rename`. */
  writtenMeanwhile: string | null = null;
  discarded = 0;

  constructor(private readonly events: RecordingAuditEvents) {}

  disk(overrides: Partial<FolderDisk> = {}): FolderDisk {
    return stubFolderDisk({
      inspect: (entry) => Promise.resolve(this.inspection(entry)),
      version: (entry) => Promise.resolve(this.versionOf(entry.relative)),
      stage: (entry, source, size) => this.stage(entry, source, size),
      ...overrides,
    });
  }

  private inspection(entry: FilePath): EntryInspection | null {
    const kind = this.files.has(entry.relative)
      ? 'file'
      : this.folders.has(entry.relative)
        ? 'directory'
        : this.others.has(entry.relative)
          ? 'other'
          : null;

    return kind === null ? null : { kind, size: 1, identity: `1:${entry.relative}` };
  }

  private versionOf(relative: string): Etag | null {
    const content = this.files.get(relative);
    return content === undefined ? null : etagOf(content);
  }

  private async stage(entry: FilePath, source: ChunkSource, size: number): Promise<StagedFile> {
    let content = '';

    for (let chunk = await source.next(); chunk !== null; chunk = await source.next()) {
      content += Buffer.from(chunk).toString('utf8');
    }

    if (content.length !== size) {
      throw new UploadSizeMismatchError(entry.relative, size, content.length);
    }

    this.log.push(`staged ${entry.relative}`);

    return {
      etag: etagOf(content),
      size,
      create: (target) => this.created(target, content),
      replace: (target, guard) => {
        if (this.writtenMeanwhile !== null) {
          this.files.set(target.relative, this.writtenMeanwhile);
        }

        guard(this.versionOf(target.relative));
        this.files.set(target.relative, content);
        this.log.push(`replaced ${target.relative} after ${this.events.kinds.join(',')}`);
        return Promise.resolve({ size, mtime: new Date(0) });
      },
      discard: () => {
        this.discarded += 1;
        return Promise.resolve();
      },
    };
  }

  private created(target: FilePath, content: string): Promise<{ size: number; mtime: Date }> {
    if (this.raced.delete(target.relative)) {
      this.files.set(target.relative, 'theirs');
    }

    if (this.files.has(target.relative)) {
      return Promise.reject(new FileExistsError(target.relative));
    }

    this.files.set(target.relative, content);
    this.log.push(`created ${target.relative} after ${String(this.events.kinds.length)} facts`);
    return Promise.resolve({ size: content.length, mtime: new Date(0) });
  }
}

/** The parts of a body; `null` stands for a part the body never carried. */
function partsOf(contents: readonly (string | null)[]): UploadParts & { skipped: number } {
  const queue = contents.map((content) => (content === null ? null : partOf(content)));
  const parts = {
    skipped: 0,
    next: (): Promise<UploadPart | null> => Promise.resolve(queue.shift() ?? null),
  };

  function partOf(content: string): UploadPart {
    let unread = content.length > 0;

    return {
      next: () => {
        const chunk = unread ? Buffer.from(content) : null;
        unread = false;
        return Promise.resolve(chunk);
      },
      skip: () => {
        if (unread) {
          parts.skipped += 1;
        }

        unread = false;
        return Promise.resolve();
      },
    };
  }

  return parts;
}

const item = (path: string, size: number, overrides: Partial<UploadItem> = {}): UploadItem => ({
  path,
  size,
  onConflict: 'fail',
  ifMatch: null,
  ...overrides,
});

const command = (
  items: readonly UploadItem[],
  overrides: Partial<UploadCommand> = {},
): UploadCommand => ({
  folder: WRITING_FOLDER.value,
  directory: '',
  items,
  confirmSensitive: false,
  ...overrides,
});

function uploader(
  events: RecordingAuditEvents,
  disk: FolderDisk,
  history = new InMemoryFileHistory(),
): UploadFilesUseCase {
  return new UploadFilesUseCase(
    aFileWriting({ disk, trail: aFileTrail(events) }),
    LIMITS,
    aHistoryKeeper(disk, { store: history }),
  );
}

const statuses = (outcomes: readonly UploadOutcome[]): string[][] =>
  outcomes.map((outcome) => [
    outcome.path.relative,
    outcome.status === 'failed' ? `failed:${outcome.error.code}` : outcome.status,
  ]);

/** Files from the desktop — plan 07, B-49, with a disk in memory and a recorded trail. */
describe('UploadFilesUseCase', () => {
  it('creates every file, each in the trail with source upload before its name — S-301, S-307', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 1), item('b.txt', 2), item('c.txt', 3)]),
      partsOf(['a', 'bb', 'ccc']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['a.txt', 'created'],
      ['b.txt', 'created'],
      ['c.txt', 'created'],
    ]);
    expect(outcomes[1]).toMatchObject({ etag: etagOf('bb') });
    expect(events.kinds).toEqual(['file.created', 'file.created', 'file.created']);
    expect(events.appended[2]?.details).toEqual({
      entryKind: 'file',
      sizeBytes: 3,
      hash: etagOf('ccc').value,
      sensitive: false,
      source: 'upload',
    });
    expect(memory.log.filter((line) => line.startsWith('created'))).toEqual([
      'created a.txt after 1 facts',
      'created b.txt after 2 facts',
      'created c.txt after 3 facts',
    ]);
    expect(memory.discarded).toBe(3);
  });

  it('fails the item whose name is taken, unread, and creates the others — S-302', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const parts = partsOf(['a', 'bb', 'c']);
    memory.files.set('b.txt', 'mine');

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 1), item('b.txt', 2), item('c.txt', 1)]),
      parts,
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['a.txt', 'created'],
      ['b.txt', 'failed:FILE_EXISTS'],
      ['c.txt', 'created'],
    ]);
    expect(outcomes[1]).toMatchObject({ error: { params: { currentEtag: etagOf('mine').value } } });
    expect(parts.skipped).toBe(1);
    expect(memory.files.get('b.txt')).toBe('mine');
  });

  it('replaces the version the item names, and only that one — S-303', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('a.txt', 'old');

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 3, { onConflict: 'replace', ifMatch: etagOf('old').value })]),
      partsOf(['new']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a.txt', 'replaced']]);
    expect(memory.files.get('a.txt')).toBe('new');
    expect(events.appended[0]).toMatchObject({
      kind: 'file.written',
      details: {
        hashBefore: etagOf('old').value,
        hashAfter: etagOf('new').value,
        source: 'upload',
      },
    });
    expect(memory.log).toContain('replaced a.txt after file.written');
  });

  it('keeps the version it replaces in the local history, before the trail — S-335', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const history = new InMemoryFileHistory();
    memory.files.set('a.txt', 'old');
    const disk: FolderDisk = {
      ...memory.disk(),
      read: (file) => {
        memory.log.push(`kept ${file.relative} after ${String(events.kinds.length)} facts`);
        return Promise.resolve({
          bytes: Buffer.from(memory.files.get(file.relative) ?? ''),
          mtime: new Date(0),
        });
      },
    };

    const outcomes = await uploader(events, disk, history).execute(
      command([item('a.txt', 3, { onConflict: 'replace', ifMatch: etagOf('old').value })]),
      partsOf(['new']),
      owner,
    );

    expect(outcomes[0]).toMatchObject({
      status: 'replaced',
      history: { kept: true, entryId: history.entries[0]?.id },
    });
    expect(history.entries[0]).toMatchObject({ reason: 'upload', hash: etagOf('old').digest });
    // Kept with nothing in the trail yet, and the name replaced only after the fact.
    expect(memory.log).toContain('kept a.txt after 0 facts');
    expect(memory.log).toContain('replaced a.txt after file.written');
  });

  it('replaces when the history fails, and the item says so — as a save does', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const history = new InMemoryFileHistory();
    history.failure = new Error('database down');
    memory.files.set('a.txt', 'old');

    const outcomes = await uploader(events, memory.disk(), history).execute(
      command([item('a.txt', 3, { onConflict: 'replace', ifMatch: etagOf('old').value })]),
      partsOf(['new']),
      owner,
    );

    expect(outcomes[0]).toMatchObject({
      status: 'replaced',
      history: { kept: false, reason: 'unavailable' },
    });
    expect(memory.files.get('a.txt')).toBe('new');
  });

  it.each([
    ['no If-Match', null, 'PRECONDITION_REQUIRED'],
    ['the wildcard', '*', 'PRECONDITION_REQUIRED'],
    ['another version', '"another"', 'FILE_CHANGED'],
  ])('refuses a replace with %s, unread — S-303', async (_name, ifMatch, code) => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const parts = partsOf(['new']);
    memory.files.set('a.txt', 'old');

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 3, { onConflict: 'replace', ifMatch })]),
      parts,
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a.txt', `failed:${code}`]]);
    expect(parts.skipped).toBe(1);
    expect(memory.files.get('a.txt')).toBe('old');
  });

  it('never replaces a folder or a device with a file', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.folders.add('src');
    memory.others.add('pipe');

    const outcomes = await uploader(events, memory.disk()).execute(
      command([
        item('src', 1, { onConflict: 'replace', ifMatch: '"x"' }),
        item('pipe', 1, { onConflict: 'replace', ifMatch: '"x"' }),
      ]),
      partsOf(['a', 'b']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['src', 'failed:FILE_NOT_A_FILE'],
      ['pipe', 'failed:FILE_NOT_A_FILE'],
    ]);
  });

  it('keeps the version somebody wrote between the check and the rename', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('a.txt', 'old');
    memory.writtenMeanwhile = 'claude';

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 3, { onConflict: 'replace', ifMatch: etagOf('old').value })]),
      partsOf(['new']),
      owner,
    );

    expect(outcomes[0]).toMatchObject({ status: 'failed', error: expect.any(FileChangedError) });
    expect(memory.files.get('a.txt')).toBe('claude');
    expect(events.kinds).toEqual(['file.written', 'file.failed']);
  });

  it('creates a replace whose file is not there — nothing to lose', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 1, { onConflict: 'replace' })]),
      partsOf(['a']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a.txt', 'created']]);
  });

  it('keeps both under a new name, the first that is free — S-303', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('docs/a.txt', 'mine');
    memory.files.set('docs/a copy.txt', 'mine too');
    memory.folders.add('docs');

    const outcomes = await uploader(events, memory.disk()).execute(
      command(
        [
          item('a.txt', 5, { onConflict: 'keepBoth' }),
          item('b.txt', 1, { onConflict: 'keepBoth' }),
        ],
        {
          directory: 'docs',
        },
      ),
      partsOf(['yours', 'b']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['docs/a copy 2.txt', 'renamed'],
      ['docs/b.txt', 'created'],
    ]);
    expect(memory.files.get('docs/a.txt')).toBe('mine');
    expect(memory.files.get('docs/a copy 2.txt')).toBe('yours');
  });

  it('takes the next name when a link finds the free one taken — conc', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('a.txt', 'mine');
    memory.raced.add('a copy.txt');

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 5, { onConflict: 'keepBoth' })]),
      partsOf(['yours']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a copy 2.txt', 'renamed']]);
    expect(events.kinds).toEqual(['file.created', 'file.failed', 'file.created']);
  });

  it('gives up keeping both when every name is taken — fron', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('a', 'mine');
    memory.files.set('a copy', 'x');

    for (let attempt = 2; attempt <= 100; attempt += 1) {
      memory.files.set(`a copy ${String(attempt)}`, 'x');
    }

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a', 1, { onConflict: 'keepBoth' })]),
      partsOf(['y']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a', 'failed:FILE_EXISTS']]);
  });

  it('refuses under the lock a name taken since the early look — conc', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const plain = memory.disk();
    let looks = 0;
    const disk = memory.disk({
      inspect: async (entry) => {
        looks += 1;
        const found = await plain.inspect(entry);

        if (looks === 1) {
          memory.files.set('a.txt', 'faster');
        }

        return found;
      },
    });

    const outcomes = await uploader(events, disk).execute(
      command([item('a.txt', 1)]),
      partsOf(['a']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([['a.txt', 'failed:FILE_EXISTS']]);
    expect(memory.files.get('a.txt')).toBe('faster');
    expect(events.appended).toEqual([]);
  });

  it('lets a trail that is down stop a keep-both, rather than try the next name', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    memory.files.set('a.txt', 'mine');
    events.failure = new Error('the database is gone');

    await expect(
      uploader(events, memory.disk()).execute(
        command([item('a.txt', 1, { onConflict: 'keepBoth' })]),
        partsOf(['y']),
        owner,
      ),
    ).rejects.toBeInstanceOf(FileTrailUnavailableError);
    expect([...memory.files.keys()]).toEqual(['a.txt']);
  });

  it('fails a part that did not carry what it declared, and one that never came — S-305', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);

    const outcomes = await uploader(events, memory.disk()).execute(
      command([item('a.txt', 3), item('b.txt', 1), item('c.txt', 1)]),
      partsOf(['ab', null]),
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['a.txt', 'failed:INVALID_INPUT'],
      ['b.txt', 'failed:INVALID_INPUT'],
      ['c.txt', 'failed:INVALID_INPUT'],
    ]);
    expect(outcomes[2]).toMatchObject({ error: { params: { declared: 1, received: 0 } } });
    expect(memory.files.size).toBe(0);
    expect(events.appended).toEqual([]);
  });

  it('asks the second step for a sensitive file, before anything — D-15', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const upload = command([item('.mcp.json', 2)]);

    await expect(
      uploader(events, memory.disk()).execute(upload, partsOf(['{}']), owner),
    ).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED', params: { reason: 'sensitiveFile' } });

    await uploader(events, memory.disk()).execute(
      { ...upload, confirmSensitive: true },
      partsOf(['{}']),
      owner,
    );
    expect(events.appended[0]?.details).toMatchObject({ sensitive: true });
  });

  it('is a 503 when the trail is down before anything was written — S-307', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    events.failure = new Error('the database is gone');

    await expect(
      uploader(events, memory.disk()).execute(
        command([item('a.txt', 1), item('b.txt', 1)]),
        partsOf(['a', 'b']),
        owner,
      ),
    ).rejects.toBeInstanceOf(FileTrailUnavailableError);
    expect(memory.files.size).toBe(0);
  });

  it('fails what is left, untried, when the trail goes down halfway', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    let calls = 0;
    const disk = memory.disk({
      locate: (entry) => {
        calls += 1;

        if (calls === 2) {
          events.failure = new Error('the database is gone');
        }

        return Promise.resolve(entry.absolute);
      },
    });

    const outcomes = await uploader(events, disk).execute(
      command([item('a.txt', 1), item('b.txt', 1), item('c.txt', 1)]),
      partsOf(['a', 'b', 'c']),
      owner,
    );

    expect(statuses(outcomes)).toEqual([
      ['a.txt', 'created'],
      ['b.txt', 'failed:SERVICE_UNAVAILABLE'],
      ['c.txt', 'failed:SERVICE_UNAVAILABLE'],
    ]);
    expect([...memory.files.keys()]).toEqual(['a.txt']);
  });

  it('lets a failure that is not a rule of the domain through — a bug of ours', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);
    const disk = memory.disk({ stage: () => Promise.reject(new Error('EIO')) });

    await expect(
      uploader(events, disk).execute(command([item('a.txt', 1)]), partsOf(['a']), owner),
    ).rejects.toThrow('EIO');
  });

  it('refuses a directory that is not there before reading a part', async () => {
    const events = new RecordingAuditEvents();
    const memory = new UploadDisk(events);

    await expect(
      uploader(events, memory.disk()).execute(
        command([item('a.txt', 1)], { directory: 'missing' }),
        partsOf(['a']),
        owner,
      ),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });
});
