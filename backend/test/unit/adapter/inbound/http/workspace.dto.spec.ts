import { describe, expect, it } from 'vitest';

import {
  folderSchema,
  listDirectoriesSchema,
  pinRecentFolderSchema,
  reorderOpenFoldersSchema,
  resolveWorkspaceSchema,
  toDirectoryListingDto,
  toOpenFolderEntryDto,
  toRecentFolderDto,
  toWorkspaceDto,
} from '@adapter/inbound/http/workspace/workspace.dto';
import { DirectoryListingCriteria, listDirectory, WorkspacePath } from '@domain/workspace';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { aWorkspace } from '../../../../support/builders/workspace.builder';
import { aFolder, OPENED_AT } from '../../../../support/builders/workspace-folder.builder';

describe('the workspace DTO', () => {
  it('carries the path, the label and the last use', () => {
    const at = new Date('2026-09-18T10:00:00.000Z');

    expect(toWorkspaceDto(aWorkspace().usedAt(at))).toEqual({
      path: '/srv/projects',
      label: 'Projects',
      lastUsedAt: '2026-09-18T10:00:00.000Z',
    });
  });

  it('carries `null` for a root nobody has opened yet', () => {
    expect(toWorkspaceDto(aWorkspace()).lastUsedAt).toBeNull();
  });

  it('never carries who else may reach the root', () => {
    // Who else the operator listed is nobody's business but the operator's, and the caller
    // already knows that they themselves may.
    expect(JSON.stringify(toWorkspaceDto(aWorkspace()))).not.toContain('auth|owner');
  });

  it('accepts a path on the query string', () => {
    expect(resolveWorkspaceSchema.safeParse({ path: '/srv/projects' }).success).toBe(true);
  });

  it.each([{}, { path: '' }, { path: 42 }])('refuses the query %j', (query) => {
    expect(resolveWorkspaceSchema.safeParse(query).success).toBe(false);
  });
});

/** What the pipe of the listing route throws for a query it must refuse. */
function refusalOf(query: unknown): InputValidationError {
  try {
    new ZodPipe(listDirectoriesSchema).transform(query);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('the query was supposed to be refused');
}

describe('what the directory listing is asked — plan 06, S-02', () => {
  it('takes an absolute path, and no flag means no hidden entries and no prefix', () => {
    expect(listDirectoriesSchema.parse({ path: '/srv/projects' })).toEqual({
      path: '/srv/projects',
      hidden: false,
    });
  });

  it('reads the flag and the prefix as the link spells them', () => {
    expect(
      listDirectoriesSchema.parse({ path: '/srv/projects', hidden: 'true', prefix: 'rem' }),
    ).toEqual({ path: '/srv/projects', hidden: true, prefix: 'rem' });
    expect(listDirectoriesSchema.parse({ path: '/srv/projects', hidden: 'false' }).hidden).toBe(
      false,
    );
  });

  it('takes a name with spaces, accents and dots that are not a climb', () => {
    const path = '/srv/projects/my app/ação/..hidden/v1..2';

    expect(listDirectoriesSchema.parse({ path }).path).toBe(path);
  });

  it.each([
    ['absent', {}],
    ['empty', { path: '' }],
    ['relative', { path: 'srv/projects' }],
    ['climbing in the middle', { path: '/srv/projects/../../etc' }],
    ['climbing at the end', { path: '/srv/projects/..' }],
    ['carrying a NUL', { path: '/srv/projects\0/etc' }],
    ['not text', { path: 42 }],
    ['absurdly long', { path: `/${'a'.repeat(4096)}` }],
  ])('refuses a path that is %s before any use case sees it', (_case, query) => {
    const refusal = refusalOf(query);

    expect(refusal.code).toBe('INVALID_INPUT');
    expect(new Set(refusal.details.map((detail) => detail.field))).toEqual(new Set(['path']));
  });

  it.each([
    ['a word that is not a boolean', { hidden: 'yes' }],
    ['an empty prefix', { prefix: '' }],
    ['a prefix that is a path', { prefix: 'a/b' }],
    ['a prefix with a NUL', { prefix: 'a\0' }],
  ])('refuses %s', (_case, extra) => {
    expect(listDirectoriesSchema.safeParse({ path: '/srv/projects', ...extra }).success).toBe(
      false,
    );
  });
});

describe('what the recent and open folders are sent — plan 06, B-04', () => {
  it('names one folder by its absolute path, in a body or in a query string', () => {
    expect(folderSchema.parse({ path: '/srv/projects/app' })).toEqual({
      path: '/srv/projects/app',
    });
    expect(folderSchema.safeParse({ path: '../app' }).success).toBe(false);
  });

  it('pins and unpins with a real boolean, never a word', () => {
    expect(pinRecentFolderSchema.parse({ path: '/srv/p', pinned: true }).pinned).toBe(true);
    expect(pinRecentFolderSchema.safeParse({ path: '/srv/p', pinned: 'true' }).success).toBe(false);
  });

  it('reorders a non-empty list of well-formed paths, and leaves the set to the use case', () => {
    expect(reorderOpenFoldersSchema.parse({ paths: ['/srv/b', '/srv/a'] }).paths).toEqual([
      '/srv/b',
      '/srv/a',
    ]);
    expect(reorderOpenFoldersSchema.safeParse({ paths: [] }).success).toBe(false);
    expect(reorderOpenFoldersSchema.safeParse({ paths: ['/srv/a', 'b'] }).success).toBe(false);
  });
});

describe('what the folder routes answer — plan 06, B-04', () => {
  it('writes a listing out with its root, its parent and every entry', () => {
    const listing = listDirectory({
      directory: WorkspacePath.create('/srv/projects/app'),
      workspace: aWorkspace(),
      criteria: new DirectoryListingCriteria(false, null),
      children: [{ kind: 'symlink', name: 'lib', target: '/srv/projects/lib' }],
      exhausted: true,
      limit: 10,
    });

    expect(toDirectoryListingDto(listing)).toEqual({
      path: '/srv/projects/app',
      root: { path: '/srv/projects', label: 'Projects', lastUsedAt: null },
      parent: '/srv/projects',
      entries: [{ name: 'lib', path: '/srv/projects/app/lib', hidden: false, symlink: true }],
      truncated: false,
    });
  });

  it('writes a null parent at the root', () => {
    const listing = listDirectory({
      directory: WorkspacePath.create('/srv/projects'),
      workspace: aWorkspace(),
      criteria: new DirectoryListingCriteria(false, null),
      children: [],
      exhausted: true,
      limit: 10,
    });

    expect(toDirectoryListingDto(listing).parent).toBeNull();
  });

  it('writes a recent folder with its instant, and available only when it is', () => {
    const view = { folder: aFolder({ pinned: true }), lastOpenedAt: OPENED_AT };

    expect(toRecentFolderDto({ ...view, rootLabel: 'Projects', state: 'available' })).toEqual({
      path: '/srv/projects/app',
      rootLabel: 'Projects',
      lastOpenedAt: OPENED_AT.toISOString(),
      pinned: true,
      available: true,
    });
    expect(toRecentFolderDto({ ...view, rootLabel: null, state: 'missing' }).available).toBe(false);
  });

  it('writes a tab with its state', () => {
    expect(
      toOpenFolderEntryDto({ folder: aFolder(), rootLabel: null, state: 'notAllowed' }),
    ).toEqual({ path: '/srv/projects/app', rootLabel: null, state: 'notAllowed' });
  });
});
