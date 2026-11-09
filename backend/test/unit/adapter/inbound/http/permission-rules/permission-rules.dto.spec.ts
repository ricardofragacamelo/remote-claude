import { describe, expect, it } from 'vitest';

import {
  patternFieldsOf,
  toToolSubject,
} from '@adapter/inbound/http/permission-rules/permission-rules.dto';

/** The subject `POST /permission-rules/evaluate` is sent — only the fields it was given. */
describe('toToolSubject', () => {
  it('carries every field when all of them are given', () => {
    expect(
      toToolSubject({
        paths: ['/a'],
        command: 'git status',
        pattern: 'TODO',
        url: 'https://example.com',
        query: 'q',
        server: 'srv',
        tool: 'tool',
        description: 'desc',
      }),
    ).toEqual({
      paths: ['/a'],
      command: 'git status',
      pattern: 'TODO',
      url: 'https://example.com',
      query: 'q',
      server: 'srv',
      tool: 'tool',
      description: 'desc',
    });
  });

  it('carries none of them when none are given — never an explicit `undefined`', () => {
    expect(toToolSubject({})).toEqual({});
  });

  it('carries only `command`, for a shell call', () => {
    expect(toToolSubject({ command: 'git status' })).toEqual({ command: 'git status' });
  });

  it('carries only `paths`, for a file call', () => {
    expect(toToolSubject({ paths: ['/a/b.ts'] })).toEqual({ paths: ['/a/b.ts'] });
  });

  it('carries only `url`, for a fetch', () => {
    expect(toToolSubject({ url: 'https://example.com' })).toEqual({ url: 'https://example.com' });
  });

  it('carries only `query`, for a search', () => {
    expect(toToolSubject({ query: 'q' })).toEqual({ query: 'q' });
  });

  it('carries only `server` and `tool`, for an MCP call', () => {
    expect(toToolSubject({ server: 'srv', tool: 'tool' })).toEqual({ server: 'srv', tool: 'tool' });
  });

  it('carries only `pattern`, for a search pattern', () => {
    expect(toToolSubject({ pattern: 'TODO' })).toEqual({ pattern: 'TODO' });
  });

  it('carries only `description`, for a subagent', () => {
    expect(toToolSubject({ description: 'desc' })).toEqual({ description: 'desc' });
  });
});

/** The four fields a draft and a grant share. */
describe('patternFieldsOf', () => {
  it('defaults a missing engine to `null` — canonical, for every engine with the kind', () => {
    expect(
      patternFieldsOf({ pattern: 'shell(git status:*)', decision: 'allow', scope: 'always' }),
    ).toEqual({
      pattern: 'shell(git status:*)',
      engine: null,
      decision: 'allow',
      scope: 'always',
    });
  });

  it('carries the engine when one is given — restricted to it', () => {
    expect(
      patternFieldsOf({
        pattern: 'shell(git status:*)',
        engine: 'claude',
        decision: 'deny',
        scope: 'project',
      }),
    ).toEqual({
      pattern: 'shell(git status:*)',
      engine: 'claude',
      decision: 'deny',
      scope: 'project',
    });
  });
});
