import { describe, expect, it } from 'vitest';

import { InvalidWorkspacePathError, WorkspacePath } from '@domain/workspace';

describe('WorkspacePath', () => {
  describe('what it refuses before looking at anything', () => {
    it.each([
      ['an empty string', ''],
      ['only whitespace', '   '],
    ])('refuses %s', (_name, raw) => {
      expect(() => WorkspacePath.create(raw)).toThrow(InvalidWorkspacePathError);
    });

    it('refuses a relative path — S-13', () => {
      // Never resolved against the process's working directory: that would invent an absolute
      // path nobody asked for, and the invented one could land inside a root.
      expect(() => WorkspacePath.create('projects/app')).toThrow(InvalidWorkspacePathError);
    });

    it.each(['./app', '../app', 'app'])('refuses the relative form %s', (raw) => {
      expect(() => WorkspacePath.create(raw)).toThrow(InvalidWorkspacePathError);
    });

    it('refuses a path carrying a NUL byte', () => {
      // A NUL truncates at the system call, so the string that is checked and the string that is
      // opened would be two different paths.
      expect(() => WorkspacePath.create('/srv/projects\0/../../etc')).toThrow(
        InvalidWorkspacePathError,
      );
    });

    it('says which field and which rule, so the client can name both', () => {
      expect.assertions(3);

      try {
        WorkspacePath.create('projects/app');
      } catch (error) {
        const failure = error as InvalidWorkspacePathError;
        expect(failure.code).toBe('INVALID_INPUT');
        expect(failure.messageKey).toBe('workspace.error.invalidPath');
        expect(failure.details).toEqual([{ field: 'path', rule: 'mustBeAbsolute' }]);
      }
    });
  });

  describe('normalisation', () => {
    it('collapses `..` so the path is compared as what it actually is — S-11', () => {
      expect(WorkspacePath.create('/srv/projects/../../etc').value).toBe('/etc');
    });

    it('collapses `.` and repeated separators', () => {
      expect(WorkspacePath.create('/srv/./projects//app').value).toBe('/srv/projects/app');
    });

    it('drops a trailing separator, so one path has exactly one spelling', () => {
      expect(WorkspacePath.create('/srv/projects/').value).toBe('/srv/projects');
    });

    it('leaves the filesystem root alone', () => {
      expect(WorkspacePath.create('/').value).toBe('/');
    });
  });

  describe('containment', () => {
    const root = WorkspacePath.create('/srv/projects');

    it('accepts a path inside the root — S-09', () => {
      expect(WorkspacePath.create('/srv/projects/app').isWithin(root)).toBe(true);
    });

    it('accepts a path several levels down', () => {
      expect(WorkspacePath.create('/srv/projects/app/packages/web').isWithin(root)).toBe(true);
    });

    it('accepts the root itself — S-16', () => {
      expect(root.isWithin(root)).toBe(true);
    });

    it('refuses a textual prefix of the root that is not a child — S-17', () => {
      // The one a `startsWith` lets through, and the reason the separator is in the comparison.
      expect(WorkspacePath.create('/srv/projects-evil').isWithin(root)).toBe(false);
    });

    it('refuses a sibling whose name only starts the same way', () => {
      expect(WorkspacePath.create('/srv/projects-evil/app').isWithin(root)).toBe(false);
    });

    it('refuses a path outside the root — S-10', () => {
      expect(WorkspacePath.create('/etc/passwd').isWithin(root)).toBe(false);
    });

    it('refuses the parent of the root', () => {
      expect(WorkspacePath.create('/srv').isWithin(root)).toBe(false);
    });

    it('accepts everything under the filesystem root, which contains everything', () => {
      expect(WorkspacePath.create('/etc').isWithin(WorkspacePath.create('/'))).toBe(true);
    });
  });

  describe('as a value', () => {
    it('is equal to another spelling of the same path', () => {
      expect(
        WorkspacePath.create('/srv/projects/').equals(WorkspacePath.create('/srv/./projects')),
      ).toBe(true);
    });

    it('is not equal to a different path', () => {
      expect(WorkspacePath.create('/srv/a').equals(WorkspacePath.create('/srv/b'))).toBe(false);
    });

    it('prints as the normalised path', () => {
      expect(String(WorkspacePath.create('/srv/projects/'))).toBe('/srv/projects');
    });
  });
});
