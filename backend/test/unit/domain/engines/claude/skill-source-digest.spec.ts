import { describe, expect, it } from 'vitest';

import { digestOfSkillSources } from '@domain/engines/claude';

describe('digestOfSkillSources — plan 13, B-35, S-170', () => {
  it('is the same sources in a different order', () => {
    const a = [
      { name: 'reverse-engineer-anything', mtimeMs: 1 },
      { name: 'skill-architect', mtimeMs: 2 },
    ];
    const b = [...a].reverse();

    expect(digestOfSkillSources(a)).toBe(digestOfSkillSources(b));
  });

  it('differs when a source is added', () => {
    const before = [{ name: 'explain', mtimeMs: 1 }];
    const after = [...before, { name: 'new-one', mtimeMs: 1 }];

    expect(digestOfSkillSources(before)).not.toBe(digestOfSkillSources(after));
  });

  it('differs when a source is removed', () => {
    const before = [
      { name: 'explain', mtimeMs: 1 },
      { name: 'other', mtimeMs: 1 },
    ];
    const after = [before[0]!];

    expect(digestOfSkillSources(before)).not.toBe(digestOfSkillSources(after));
  });

  it('differs when a source is edited in place — the mtime alone changes', () => {
    const before = [{ name: 'explain', mtimeMs: 1 }];
    const after = [{ name: 'explain', mtimeMs: 2 }];

    expect(digestOfSkillSources(before)).not.toBe(digestOfSkillSources(after));
  });

  it('is a fixed digest for no sources at all', () => {
    expect(digestOfSkillSources([])).toBe(digestOfSkillSources([]));
  });
});
