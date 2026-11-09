import { describe, expect, it } from 'vitest';

import { parseRulePattern, patternCovers } from '@domain/permission';
import type { ReachableRule } from '@domain/permission';

const of = (pattern: string, engine: string | null = null): ReachableRule => ({
  engine,
  pattern: parseRulePattern(pattern),
});

/**
 * Containment between two patterns of the canonical grammar — plan 15, B-08, D-20. It is what the
 * redundancy analysis (B-15) asks to tell a rule that adds nothing from one that already covers it.
 */
describe('patternCovers', () => {
  it('lets the whole kind cover everything of it — tool ⊇ prefix ⊇ exact — S-18', () => {
    expect(patternCovers(of('shell'), of('shell(git status:*)'))).toBe(true);
    expect(patternCovers(of('shell'), of('shell(git status)'))).toBe(true);
    expect(patternCovers(of('shell(git status:*)'), of('shell(git status)'))).toBe(true);
    expect(patternCovers(of('shell(git status:*)'), of('shell(git status --short)'))).toBe(true);
  });

  it('never covers upward — a narrower pattern does not cover a wider one — S-18', () => {
    expect(patternCovers(of('shell(git status:*)'), of('shell'))).toBe(false);
    expect(patternCovers(of('shell(git status)'), of('shell(git status:*)'))).toBe(false);
    expect(patternCovers(of('shell(git status)'), of('shell'))).toBe(false);
  });

  it('respects the token boundary — a prefix of a prefix is not a textual prefix — S-18', () => {
    // "gi" is a textual prefix of "git status", but not a prefix at a token boundary.
    expect(patternCovers(of('shell(gi:*)'), of('shell(git status:*)'))).toBe(false);
    expect(patternCovers(of('shell(git:*)'), of('shell(git status:*)'))).toBe(true);
    expect(patternCovers(of('shell(git:*)'), of('shell(git status)'))).toBe(true);
    expect(patternCovers(of('shell(git:*)'), of('shell(gitx)'))).toBe(false);
  });

  it('never covers across kinds, however the patterns read as text — S-18', () => {
    expect(patternCovers(of('shell'), of('file.edit'))).toBe(false);
    expect(patternCovers(of('file.edit(src/**)'), of('shell(git status)'))).toBe(false);
  });

  it('covers an MCP server-wide rule over one of its tools, never a different server', () => {
    expect(patternCovers(of('mcp(srv:*)'), of('mcp(srv:tool)'))).toBe(true);
    expect(patternCovers(of('mcp(srv:*)'), of('mcp(other:tool)'))).toBe(false);
    expect(patternCovers(of('mcp(srv:tool)'), of('mcp(srv:*)'))).toBe(false);
  });

  it('covers a glob over the paths it widens into, including a narrower glob', () => {
    expect(patternCovers(of('file.edit(src/**)'), of('file.edit(src/a.ts)'))).toBe(true);
    expect(patternCovers(of('file.edit(src/**)'), of('file.edit(src/sub/**)'))).toBe(true);
    expect(patternCovers(of('file.edit(src/*.ts)'), of('file.edit(src/**)'))).toBe(false);
  });

  it('covers one web.fetch domain over itself only — a host has no narrower form', () => {
    expect(
      patternCovers(of('web.fetch(domain:example.com)'), of('web.fetch(domain:example.com)')),
    ).toBe(true);
    expect(
      patternCovers(of('web.fetch(domain:example.com)'), of('web.fetch(domain:other.com)')),
    ).toBe(false);
  });

  it('never lets a rule restricted to one engine cover one restricted to another — S-18', () => {
    expect(patternCovers(of('shell', 'claude'), of('shell(git status:*)', 'claude'))).toBe(true);
    expect(patternCovers(of('shell', 'claude'), of('shell(git status:*)', 'other'))).toBe(false);
    expect(patternCovers(of('shell', 'claude'), of('shell(git status:*)', null))).toBe(false);
  });

  it('lets a canonical rule (no engine) cover a rule restricted to any engine — S-18', () => {
    expect(patternCovers(of('shell'), of('shell(git status:*)', 'claude'))).toBe(true);
    expect(patternCovers(of('shell'), of('shell(git status:*)', null))).toBe(true);
  });
});
