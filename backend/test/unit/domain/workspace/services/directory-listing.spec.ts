import { describe, expect, it } from 'vitest';

import {
  DIRECTORY_LISTING_LIMIT,
  DirectoryListingCriteria,
  listDirectory,
  WorkspacePath,
} from '@domain/workspace';
import type { DirectoryChild, DirectoryListingInput } from '@domain/workspace';
import { aWorkspace } from '../../../../support/builders/workspace.builder';

const workspace = aWorkspace({ root: '/srv/projects' });
const everything = new DirectoryListingCriteria(false, null);

/** A listing of `/srv/projects/app` with sensible defaults, so a test states only what matters. */
function list(overrides: Partial<DirectoryListingInput> = {}) {
  return listDirectory({
    directory: WorkspacePath.create('/srv/projects/app'),
    workspace,
    criteria: everything,
    children: [],
    exhausted: true,
    limit: DIRECTORY_LISTING_LIMIT,
    ...overrides,
  });
}

const directory = (name: string): DirectoryChild => ({ kind: 'directory', name });
const link = (name: string, target: string | null): DirectoryChild => ({
  kind: 'symlink',
  name,
  target,
});

const names = (children: readonly DirectoryChild[], extra: Partial<DirectoryListingInput> = {}) =>
  list({ children, ...extra }).entries.map((entry) => entry.name);

describe('listDirectory', () => {
  describe('order — plan 06, S-08', () => {
    it('orders names without regard to case', () => {
      expect(names([directory('beta'), directory('Alpha'), directory('gamma')])).toEqual([
        'Alpha',
        'beta',
        'gamma',
      ]);
    });

    it('puts numbers in natural order — dir2 before dir10', () => {
      expect(names([directory('dir10'), directory('dir2'), directory('dir1')])).toEqual([
        'dir1',
        'dir2',
        'dir10',
      ]);
    });

    it('keeps two names that differ only in case in the same order whatever the port read', () => {
      const forwards = names([directory('Readme'), directory('readme')]);
      const backwards = names([directory('readme'), directory('Readme')]);

      expect(forwards).toEqual(backwards);
      expect(forwards).toEqual(['Readme', 'readme']);
    });

    it('lists the same directory the same way twice', () => {
      const children = [directory('b'), directory('a2'), directory('A10')];

      expect(names(children)).toEqual(names([...children].reverse()));
    });
  });

  describe('entries', () => {
    it('lists a directory with the path as listed, not hidden, not a link', () => {
      expect(list({ children: [directory('src')] }).entries).toEqual([
        { name: 'src', path: '/srv/projects/app/src', hidden: false, symlink: false },
      ]);
    });

    it('answers no entry for a directory with no subdirectory — plan 06, S-10', () => {
      const listing = list({ children: [] });

      expect(listing.entries).toEqual([]);
      expect(listing.truncated).toBe(false);
    });

    it('never answers a file, a socket, a fifo or a device — plan 06, S-09', () => {
      // They never reach the rule as directories: the port hands over directories and links only,
      // and a link to anything that is not a directory arrives without a target.
      expect(names([link('socket-link', null), directory('real')])).toEqual(['real']);
    });
  });

  describe('hidden names — plan 06, S-14', () => {
    const children = [directory('.git'), directory('src')];

    it('leaves out a name starting with a dot by default', () => {
      expect(names(children)).toEqual(['src']);
    });

    it('lists it, marked, when hidden names are asked for', () => {
      const listing = list({ children, criteria: new DirectoryListingCriteria(true, null) });

      expect(listing.entries.map((entry) => [entry.name, entry.hidden])).toEqual([
        ['.git', true],
        ['src', false],
      ]);
    });

    it('lists node_modules like any other folder — there is no list of heavy names', () => {
      expect(names([directory('node_modules')])).toEqual(['node_modules']);
    });
  });

  describe('prefix — plan 06, S-13', () => {
    it('keeps only the names that start with it, ignoring case', () => {
      const criteria = new DirectoryListingCriteria(false, 'Lib');

      expect(
        names([directory('library'), directory('LIBS'), directory('src')], { criteria }),
      ).toEqual(['library', 'LIBS']);
    });

    it('still leaves out a hidden name unless hidden names are asked for', () => {
      const criteria = new DirectoryListingCriteria(false, '.g');

      expect(names([directory('.git')], { criteria })).toEqual([]);
    });
  });

  describe('symlinks', () => {
    it('lists a link to a directory inside the same root, marked — plan 06, S-15', () => {
      expect(list({ children: [link('shared', '/srv/projects/lib')] }).entries).toEqual([
        { name: 'shared', path: '/srv/projects/app/shared', hidden: false, symlink: true },
      ]);
    });

    it('lists a link whose target is the root itself', () => {
      expect(names([link('up', '/srv/projects')])).toEqual(['up']);
    });

    it('omits a link whose target is outside the root — plan 06, S-16', () => {
      expect(names([link('escape', '/etc')])).toEqual([]);
    });

    it('omits a link to a textual prefix of the root that is not inside it', () => {
      expect(names([link('evil', '/srv/projects-evil')])).toEqual([]);
    });

    it('omits a broken link, a loop and a link to something that is not a directory — S-17', () => {
      expect(names([link('broken', null), link('loop', null)])).toEqual([]);
    });

    it('omits a link whose target is not an absolute path', () => {
      expect(names([link('odd', 'relative/target')])).toEqual([]);
    });
  });

  describe('ceiling — plan 06, S-11', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => directory(`dir${String(index)}`));

    it('answers exactly the ceiling untruncated', () => {
      const listing = list({ children: many(3), limit: 3 });

      expect(listing.entries).toHaveLength(3);
      expect(listing.truncated).toBe(false);
    });

    it('answers the ceiling and truncated for one past it', () => {
      const listing = list({ children: many(4), limit: 3 });

      expect(listing.entries.map((entry) => entry.name)).toEqual(['dir0', 'dir1', 'dir2']);
      expect(listing.truncated).toBe(true);
    });

    it('answers truncated when the port stopped before the end, whatever it kept', () => {
      // One of the four it read was a link that escapes: three survive, and there may be more.
      const children = [...many(3), link('escape', '/etc')];

      expect(list({ children, limit: 3, exhausted: false }).truncated).toBe(true);
    });

    it('starts from a thousand', () => {
      expect(DIRECTORY_LISTING_LIMIT).toBe(1000);
    });
  });

  describe('parent — plan 06, S-18', () => {
    it('is null at the root: nothing above it is ever listed', () => {
      expect(list({ directory: WorkspacePath.create('/srv/projects') }).parent).toBeNull();
    });

    it('is the directory above, inside the root', () => {
      expect(list({ directory: WorkspacePath.create('/srv/projects/app/src') }).parent?.value).toBe(
        '/srv/projects/app',
      );
    });

    it('is the root for a directory right under it', () => {
      expect(list().parent?.value).toBe('/srv/projects');
    });
  });

  it('answers the directory and the root it was listed under', () => {
    const listing = list();

    expect(listing.path.value).toBe('/srv/projects/app');
    expect(listing.workspace).toBe(workspace);
  });
});

describe('DirectoryListingCriteria', () => {
  it('admits every visible name with no prefix', () => {
    expect(everything.admits('anything')).toBe(true);
  });

  it('admits a hidden name only when asked to', () => {
    expect(new DirectoryListingCriteria(false, null).admits('.env')).toBe(false);
    expect(new DirectoryListingCriteria(true, null).admits('.env')).toBe(true);
  });

  it('admits a name by prefix without regard to case', () => {
    const criteria = new DirectoryListingCriteria(true, 'SR');

    expect(criteria.admits('src')).toBe(true);
    expect(criteria.admits('lib')).toBe(false);
  });
});
