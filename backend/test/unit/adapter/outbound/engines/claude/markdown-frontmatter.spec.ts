import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '@adapter/outbound/engines/claude/markdown-frontmatter';

describe('parseFrontmatter — plan 13, B-33, B-36, B-37', () => {
  it('reads the fields of a well-formed frontmatter block', () => {
    expect(parseFrontmatter('---\nname: writer\ndescription: writes code\n---\nBody')).toEqual({
      name: 'writer',
      description: 'writes code',
    });
  });

  it('is empty for a file with no frontmatter block at all', () => {
    expect(parseFrontmatter('Just a body, no frontmatter.')).toEqual({});
  });

  it('is empty for a frontmatter block that is empty', () => {
    expect(parseFrontmatter('---\n---\nBody')).toEqual({});
  });

  it('is empty when the block parses to something other than a mapping — a scalar', () => {
    expect(parseFrontmatter('---\njust a string\n---\nBody')).toEqual({});
  });

  it('is empty when the block parses to something other than a mapping — a list', () => {
    expect(parseFrontmatter('---\n- one\n- two\n---\nBody')).toEqual({});
  });

  it('is empty, never throwing, for a block that is not valid YAML at all (S-143)', () => {
    expect(parseFrontmatter('---\nname: "unterminated\n---\nBody')).toEqual({});
  });

  it('accepts a block ending the file with no trailing newline after the closing fence', () => {
    expect(parseFrontmatter('---\nname: at-eof\n---')).toEqual({ name: 'at-eof' });
  });
});
