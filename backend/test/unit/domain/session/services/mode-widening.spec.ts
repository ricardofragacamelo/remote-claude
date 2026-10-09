import { describe, expect, it } from 'vitest';

import { widensSessionMode } from '@domain/session';

describe('widensSessionMode — plan 13, D-23', () => {
  it.each([
    ['default', 'acceptEdits'],
    ['default', 'bypassPermissions'],
    ['default', 'auto'],
    ['plan', 'default'],
    ['acceptEdits', 'bypassPermissions'],
  ])('asks again when a session in %s gets a call in the wider %s', (session, call) => {
    expect(widensSessionMode(session, call)).toBe(true);
  });

  it.each([
    ['default', 'default'],
    ['default', 'plan'],
    ['default', 'dontAsk'],
    ['acceptEdits', 'acceptEdits'],
    ['acceptEdits', 'default'],
  ])('lets a call in a mode no wider than the session through — %s, %s', (session, call) => {
    expect(widensSessionMode(session, call)).toBe(false);
  });

  it('lets through a call the CLI said no mode of', () => {
    expect(widensSessionMode('default', undefined)).toBe(false);
  });

  it('fails closed on a mode it does not know', () => {
    expect(widensSessionMode('default', 'yolo')).toBe(true);
    expect(widensSessionMode('yolo', 'default')).toBe(false);
  });
});
