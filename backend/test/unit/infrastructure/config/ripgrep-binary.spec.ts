import { describe, expect, it } from 'vitest';

import {
  MINIMUM_RIPGREP_VERSION,
  meetsMinimumVersion,
  parseRipgrepVersion,
} from '@infra/config/ripgrep-binary';

describe('parseRipgrepVersion', () => {
  it('reads the version off the first line of --version', () => {
    expect(parseRipgrepVersion('ripgrep 15.0.0 (rev 3a612f88b8)\n\nfeatures:+pcre2\n')).toEqual({
      major: 15,
      minor: 0,
      patch: 0,
    });
  });

  it('answers null for output that is not ripgrep’s own', () => {
    expect(parseRipgrepVersion('bash: rg: command not found')).toBeNull();
  });

  it('answers null for empty output', () => {
    expect(parseRipgrepVersion('')).toBeNull();
  });
});

describe('meetsMinimumVersion', () => {
  const floor = { major: 13, minor: 5, patch: 2 };

  it('accepts exactly the minimum', () => {
    expect(meetsMinimumVersion(floor, floor)).toBe(true);
  });

  it('accepts a newer major version, whatever its minor and patch are', () => {
    expect(meetsMinimumVersion({ major: 14, minor: 0, patch: 0 }, floor)).toBe(true);
  });

  it('refuses an older major version — S-20', () => {
    expect(meetsMinimumVersion({ major: 12, minor: 99, patch: 99 }, floor)).toBe(false);
  });

  it('accepts a newer minor version of the same major, whatever its patch is', () => {
    expect(meetsMinimumVersion({ major: 13, minor: 6, patch: 0 }, floor)).toBe(true);
  });

  it('refuses an older minor version of the same major', () => {
    expect(meetsMinimumVersion({ major: 13, minor: 4, patch: 99 }, floor)).toBe(false);
  });

  it('accepts a newer patch of the same major and minor', () => {
    expect(meetsMinimumVersion({ major: 13, minor: 5, patch: 3 }, floor)).toBe(true);
  });

  it('refuses an older patch of the same major and minor', () => {
    expect(meetsMinimumVersion({ major: 13, minor: 5, patch: 1 }, floor)).toBe(false);
  });

  it('the exported floor is a real, immutable value', () => {
    expect(MINIMUM_RIPGREP_VERSION).toMatchObject({
      major: expect.any(Number),
      minor: expect.any(Number),
      patch: expect.any(Number),
    });
    expect(Object.isFrozen(MINIMUM_RIPGREP_VERSION)).toBe(true);
  });
});
