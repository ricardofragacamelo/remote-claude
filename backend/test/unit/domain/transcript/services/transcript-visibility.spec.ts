import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { transcriptOriginFor } from '@domain/transcript';
import { anAllowlist, aWorkspace, OWNER } from '../../../../support/builders/workspace.builder';
import { aTranscriptSession } from '../../../../support/builders/transcript.builder';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

/** Two roots: one of the owner's, and one both of them may use. */
const allowlist = anAllowlist([
  aWorkspace({ root: '/srv/projects', label: 'Projects' }),
  aWorkspace({ root: '/srv/shared', label: 'Shared', users: [OWNER, 'auth|stranger'] }),
]);

describe('transcriptOriginFor', () => {
  it('shows a conversation nobody opened here as `external` — S-01', () => {
    expect(
      transcriptOriginFor(aTranscriptSession(), { allowlist, userId: owner, openedBy: undefined }),
    ).toBe('external');
  });

  it('shows one the caller opened here as `ours` — S-01', () => {
    expect(
      transcriptOriginFor(aTranscriptSession(), { allowlist, userId: owner, openedBy: owner }),
    ).toBe('ours');
  });

  it('hides a conversation with no working directory — S-54', () => {
    // Failing closed: nothing proves it belongs to an allowed root.
    expect(
      transcriptOriginFor(aTranscriptSession({ cwd: null }), {
        allowlist,
        userId: owner,
        openedBy: undefined,
      }),
    ).toBeNull();
  });

  it('hides one whose working directory is outside the caller`s roots — S-55', () => {
    // A worktree of an allowed repository is another path on disk.
    expect(
      transcriptOriginFor(aTranscriptSession({ cwd: '/srv/projects-worktrees/app' }), {
        allowlist,
        userId: owner,
        openedBy: undefined,
      }),
    ).toBeNull();
  });

  it('hides one whose working directory is not a path at all', () => {
    expect(
      transcriptOriginFor(aTranscriptSession({ cwd: 'relative' }), {
        allowlist,
        userId: owner,
        openedBy: undefined,
      }),
    ).toBeNull();
  });

  it('hides one another person opened here, even under a root both may use — S-04', () => {
    expect(
      transcriptOriginFor(aTranscriptSession({ cwd: '/srv/shared/app' }), {
        allowlist,
        userId: owner,
        openedBy: stranger,
      }),
    ).toBeNull();
  });

  it('shows an external one under a shared root to both people who may reach it', () => {
    const session = aTranscriptSession({ cwd: '/srv/shared/app' });

    expect(transcriptOriginFor(session, { allowlist, userId: owner, openedBy: undefined })).toBe(
      'external',
    );
    expect(transcriptOriginFor(session, { allowlist, userId: stranger, openedBy: undefined })).toBe(
      'external',
    );
  });
});
