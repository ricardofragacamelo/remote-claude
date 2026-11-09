import { describe, expect, it } from 'vitest';

import { projectPathReaches } from '@domain/permission';

describe('projectPathReaches — plan 15, D-10, S-29, S-30', () => {
  it('reaches its own folder', () => {
    expect(projectPathReaches('/srv/projects/app', '/srv/projects/app')).toBe(true);
  });

  it('reaches a folder inside it, at a `/` boundary', () => {
    expect(projectPathReaches('/srv/projects/app', '/srv/projects/app/backend')).toBe(true);
    expect(projectPathReaches('/srv/projects/app', '/srv/projects/app/a/b/c')).toBe(true);
  });

  it('never reaches a sibling that merely shares the text as a prefix', () => {
    expect(projectPathReaches('/srv/projects/app', '/srv/projects/app2')).toBe(false);
  });

  it('never reaches the parent above it', () => {
    expect(projectPathReaches('/srv/projects/app', '/srv/projects')).toBe(false);
  });

  it('never reaches an unrelated folder', () => {
    expect(projectPathReaches('/srv/projects/app', '/etc')).toBe(false);
  });
});
