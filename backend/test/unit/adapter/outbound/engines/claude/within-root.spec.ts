import { describe, expect, it } from 'vitest';

import { isWithinRoot } from '@adapter/outbound/engines/claude/within-root';

describe('isWithinRoot — plan 13, B-24, B-31, B-35', () => {
  it('is true for the root itself', () => {
    expect(isWithinRoot('/srv/project', '/srv/project')).toBe(true);
  });

  it('is true for a path under the root', () => {
    expect(isWithinRoot('/srv/project/sub/file.md', '/srv/project')).toBe(true);
  });

  it('is false for a path outside the root', () => {
    expect(isWithinRoot('/srv/other', '/srv/project')).toBe(false);
  });

  it('is false for a sibling whose name merely starts with the root’s own name', () => {
    expect(isWithinRoot('/srv/project-evil/file.md', '/srv/project')).toBe(false);
  });
});
