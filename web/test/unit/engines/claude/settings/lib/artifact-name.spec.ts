import { describe, expect, it } from 'vitest';

import { isValidArtifactName } from '@/engines/claude/settings/lib/artifact-name';

describe('isValidArtifactName — plan 13, D-18', () => {
  it('accepts lower-case letters, digits and hyphens', () => {
    expect(isValidArtifactName('review-pr')).toBe(true);
    expect(isValidArtifactName('v2')).toBe(true);
  });

  it('refuses an empty name', () => {
    expect(isValidArtifactName('')).toBe(false);
  });

  it('refuses a name over 64 characters', () => {
    expect(isValidArtifactName('a'.repeat(65))).toBe(false);
  });

  it('accepts exactly 64 characters', () => {
    expect(isValidArtifactName('a'.repeat(64))).toBe(true);
  });

  it('refuses upper-case letters, spaces, slashes and leading/trailing hyphens', () => {
    expect(isValidArtifactName('Review')).toBe(false);
    expect(isValidArtifactName('review pr')).toBe(false);
    expect(isValidArtifactName('a/b')).toBe(false);
    expect(isValidArtifactName('-review')).toBe(false);
    expect(isValidArtifactName('review-')).toBe(false);
  });

  it('refuses a path traversal attempt', () => {
    expect(isValidArtifactName('..')).toBe(false);
    expect(isValidArtifactName('../etc')).toBe(false);
  });
});
