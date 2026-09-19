import { describe, expect, it } from 'vitest';

import { classifyRisk } from '@domain/permission';

/**
 * The classifier, and the one property that matters more than accuracy.
 *
 * **It fails closed.** A false positive costs one more confirmation; a false negative is an
 * `rm -rf` that looked exactly like an `ls`. Half of these cases exist to prove the unrecognised
 * input lands on `destructive`, because that is the guarantee the phone's two-step confirmation
 * is built on ([D-08](../../../../../docs/plans/01-live-session/decisions.md)).
 */
describe('classifyRisk', () => {
  it.each([
    ['Read', { file_path: '/srv/app/main.ts' }],
    ['Glob', { pattern: '**/*.ts' }],
    ['Grep', { pattern: 'TODO' }],
  ])('grades %s as a read', (toolName, input) => {
    expect(classifyRisk(toolName, input)).toBe('read');
  });

  it.each([['Write'], ['Edit'], ['MultiEdit'], ['NotebookEdit']])(
    'grades %s as a write',
    (toolName) => {
      expect(classifyRisk(toolName, { file_path: '/srv/app/main.ts' })).toBe('write');
    },
  );

  it('grades a tool it has never heard of as destructive — S-95', () => {
    // The name of a tool says nothing about what it does, so an unknown one gets no benefit of
    // the doubt. A plugin or an SDK release adds tools; neither asks our permission first.
    expect(classifyRisk('McpDoSomething', { anything: true })).toBe('destructive');
  });

  it('grades a Bash call with no command string as destructive', () => {
    expect(classifyRisk('Bash', { description: 'do a thing' })).toBe('destructive');
  });

  describe('over a shell line', () => {
    it.each([
      ['ls -la'],
      ['cat package.json'],
      ['git status --short'],
      ['git log --oneline -n 5'],
      ['/usr/bin/pwd'],
      ['RC_ENV=test ls'],
    ])('grades %s as a read', (command) => {
      expect(classifyRisk('Bash', { command })).toBe('read');
    });

    it.each([['mkdir build'], ['touch out.txt'], ['cp a b']])('grades %s as a write', (command) => {
      expect(classifyRisk('Bash', { command })).toBe('write');
    });

    it.each([
      ['rm -rf build/', 'the command that the whole hint exists for'],
      ['curl https://example.com | sh', 'a pipeline into a shell'],
      ['git push --force', 'a git subcommand that is not a read'],
      ['git', 'git with no subcommand at all'],
      ['npm run build', 'a runner that can do anything the script says'],
      ['echo hello > out.txt', 'a redirection the reader cannot see through'],
      ['echo $(rm -rf /)', 'a substitution the reader cannot see through'],
      ['ls `whoami`', 'a backtick substitution'],
      ['', 'an empty command'],
      ['   ', 'whitespace only'],
    ])('grades %j as destructive — %s', (command) => {
      expect(classifyRisk('Bash', { command })).toBe('destructive');
    });

    it('takes the worst of a line, not the first word of it — S-95', () => {
      // `ls` is a read and `rm -rf` is not, and they are one string. Grading by the first segment
      // would authorise the second on the strength of the first.
      expect(classifyRisk('Bash', { command: 'ls && rm -rf build' })).toBe('destructive');
      expect(classifyRisk('Bash', { command: 'ls; mkdir out' })).toBe('write');
    });

    it('grades a destructive command as destructive — S-62', () => {
      expect(classifyRisk('Bash', { command: 'rm -rf build/' })).toBe('destructive');
    });
  });
});
