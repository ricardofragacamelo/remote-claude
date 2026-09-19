import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  InvalidWorkspacePathError,
  WorkspaceNotAllowedError,
  WorkspaceForbiddenError,
} from '@domain/workspace';
import { anAllowlist, aWorkspace, OWNER } from '../../../../support/builders/workspace.builder';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

describe('WorkspaceAllowlist', () => {
  describe('resolve', () => {
    it('accepts a path inside a root of this user — S-09', () => {
      const { path, workspace } = anAllowlist().resolve('/srv/projects/app', owner);

      expect(path.value).toBe('/srv/projects/app');
      expect(workspace.label).toBe('Projects');
    });

    it('accepts the root itself — S-16', () => {
      expect(anAllowlist().resolve('/srv/projects', owner).path.value).toBe('/srv/projects');
    });

    it('accepts a path that only becomes the root after normalisation', () => {
      expect(anAllowlist().resolve('/srv/projects/app/..', owner).path.value).toBe('/srv/projects');
    });

    it('refuses a path outside every root — S-10', () => {
      expect(() => anAllowlist().resolve('/etc/passwd', owner)).toThrow(WorkspaceNotAllowedError);
    });

    it('refuses a `..` that escapes the root once normalised — S-11', () => {
      // The check runs on `/etc`, not on the string that was typed.
      expect(() => anAllowlist().resolve('/srv/projects/../../etc', owner)).toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('refuses a textual prefix of a root that is not a child — S-17', () => {
      expect(() => anAllowlist().resolve('/srv/projects-evil', owner)).toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('refuses a relative path before consulting any root — S-13', () => {
      expect(() => anAllowlist().resolve('projects/app', owner)).toThrow(InvalidWorkspacePathError);
    });

    it('refuses a root that exists and is somebody else’s — D-17', () => {
      // `403`, because that is what it is: the caller is who they say they are and still may not
      // open it. The earlier design answered `404` here to avoid confirming that the directory
      // exists; that was a semantics of its own, and it is gone.
      expect(() => anAllowlist().resolve('/srv/projects/app', stranger)).toThrow(
        WorkspaceForbiddenError,
      );
    });

    it('keeps the two refusals apart, because they say different things', () => {
      expect.assertions(2);

      try {
        anAllowlist().resolve('/etc', stranger);
      } catch (error) {
        // Outside every root: no root was matched at all.
        expect((error as WorkspaceNotAllowedError).code).toBe('WORKSPACE_NOT_ALLOWED');
      }

      try {
        anAllowlist().resolve('/srv/projects', stranger);
      } catch (error) {
        // Under a root that exists, declared for somebody else. Same status, different code —
        // the client shows a different sentence, and neither invites insisting.
        expect((error as WorkspaceForbiddenError).code).toBe('FORBIDDEN');
      }
    });

    it('picks the root that actually contains the path, not the first declared', () => {
      const allowlist = anAllowlist([
        aWorkspace({ root: '/srv/other', label: 'Other' }),
        aWorkspace({ root: '/srv/projects', label: 'Projects' }),
      ]);

      expect(allowlist.resolve('/srv/projects/app', owner).workspace.label).toBe('Projects');
    });

    it('refuses everything when the allowlist declares nothing', () => {
      expect(() => anAllowlist([]).resolve('/srv/projects', owner)).toThrow(
        WorkspaceNotAllowedError,
      );
    });
  });

  describe('for', () => {
    const allowlist = anAllowlist([
      aWorkspace({ root: '/srv/mine', label: 'Mine', users: [OWNER] }),
      aWorkspace({ root: '/srv/theirs', label: 'Theirs', users: ['auth|stranger'] }),
      aWorkspace({ root: '/srv/shared', label: 'Shared', users: [OWNER, 'auth|stranger'] }),
    ]);

    it('lists only the roots this user may reach', () => {
      expect(allowlist.for(owner).map((workspace) => workspace.label)).toEqual(['Mine', 'Shared']);
    });

    it('lists the other user’s roots for the other user', () => {
      expect(allowlist.for(stranger).map((workspace) => workspace.label)).toEqual([
        'Theirs',
        'Shared',
      ]);
    });

    it('answers nothing for a subject no root mentions', () => {
      expect(allowlist.for(UserId.create('auth|nobody'))).toEqual([]);
    });

    it('keeps the order the file declared', () => {
      expect(allowlist.for(owner)[0]?.root.value).toBe('/srv/mine');
    });
  });
});
