import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { workspaceAllowlistSchema } from '../../../packages/config/src/workspace-allowlist.ts';
import {
  LOCAL_ALLOWLIST_FILE,
  activeAllowlist,
  addRoot,
  allowlistCheck,
  defaultUsers,
  expandPath,
  localFromDefault,
  needsConfirmation,
  pidFileOf,
  refusalFor,
  removeRoot,
  signalBackend,
  validate,
  withActiveAllowlist,
} from '../../../scripts/lib/allowlist.mjs';
import { parseArguments } from '../../../scripts/lib/allowlist-command.mjs';
import { ALLOWLIST_FILE } from '../../../scripts/lib/workspaces.mjs';

/**
 * The rules behind `pnpm allowlist`, with no disk and no process: where a typed path lands, what is
 * refused, what the document becomes, which file `pnpm dev` runs with (plan 06, B-10, B-11).
 */

const DEFAULT = [
  '# shipped header',
  'roots:',
  '  - path: /tmp/remote-claude-workspaces',
  '    label: Scratch',
  '    # why this one',
  '    users:',
  '      - dev-user',
  '      - approver',
  '',
].join('\n');

const root = path.dirname(path.dirname(ALLOWLIST_FILE));

describe('expandPath — plan 06, S-52', () => {
  const where = { home: '/home/dev', cwd: '/work/here' };

  it('expands the home directory, alone or at the start', () => {
    expect(expandPath('~', where)).toBe('/home/dev');
    expect(expandPath('~/projects/remote-claude', where)).toBe('/home/dev/projects/remote-claude');
  });

  it('resolves a relative path against the current directory', () => {
    expect(expandPath('project', where)).toBe('/work/here/project');
    expect(expandPath('../other', where)).toBe('/work/other');
  });

  it('normalises an absolute path', () => {
    expect(expandPath('/srv/projects/./app/', where)).toBe('/srv/projects/app');
  });

  it('does not take a name that merely starts with a tilde for the home directory', () => {
    expect(expandPath('~other', where)).toBe('/work/here/~other');
  });
});

describe('refusalFor — plan 06, S-53', () => {
  const directory = { isDirectory: () => true };
  const file = { isDirectory: () => false };

  it('refuses the root of the filesystem, before even looking', () => {
    expect(refusalFor('/', () => directory)).toBe('systemRoot');
  });

  it('refuses what is not there', () => {
    expect(refusalFor('/srv/gone', () => null)).toBe('missing');
  });

  it('refuses a file', () => {
    expect(refusalFor('/srv/readme.md', () => file)).toBe('notADirectory');
  });

  it('accepts an existing directory', () => {
    expect(refusalFor('/srv/projects', () => directory)).toBeNull();
  });
});

describe('needsConfirmation — plan 06, S-54', () => {
  it('asks for the home directory itself, and for anything above it', () => {
    expect(needsConfirmation('/home/dev', '/home/dev')).toBe(true);
    expect(needsConfirmation('/home', '/home/dev')).toBe(true);
  });

  it('does not ask for a folder inside the home directory, nor one beside it', () => {
    expect(needsConfirmation('/home/dev/projects', '/home/dev')).toBe(false);
    expect(needsConfirmation('/srv/projects', '/home/dev')).toBe(false);
    expect(needsConfirmation('/home/devil', '/home/dev')).toBe(false);
  });
});

describe('the document', () => {
  it('reads the users of the development realm from the default — S-50', () => {
    expect(defaultUsers(DEFAULT)).toEqual(['dev-user', 'approver']);
  });

  it('starts a local copy from the default, roots and comments kept, under its own header', () => {
    const local = localFromDefault(DEFAULT);

    expect(local).toContain('THIS machine');
    expect(local).not.toContain('# shipped header');
    expect(local).toContain('# why this one');
    expect(parseYaml(local)).toEqual(parseYaml(DEFAULT));
  });

  it('adds a root, and says it changed', () => {
    const added = addRoot(DEFAULT, { path: '/srv/app', label: 'app', users: ['dev-user'] });

    expect(added.changed).toBe(true);
    expect(parseYaml(added.text).roots).toEqual([
      expect.objectContaining({ label: 'Scratch' }),
      { path: '/srv/app', label: 'app', users: ['dev-user'] },
    ]);
    expect(added.text).toContain('# why this one');
  });

  it('adds the same root twice as once — S-51', () => {
    const once = addRoot(DEFAULT, { path: '/srv/app', label: 'app', users: ['u'] });
    const twice = addRoot(once.text, { path: '/srv/app', label: 'app', users: ['u'] });

    expect(twice).toEqual({ text: once.text, changed: false });
  });

  it('removes a root, and changes nothing for one that is not there — S-55', () => {
    const once = addRoot(DEFAULT, { path: '/srv/app', label: 'app', users: ['u'] }).text;

    expect(parseYaml(removeRoot(once, '/srv/app').text)).toEqual(parseYaml(DEFAULT));
    expect(removeRoot(DEFAULT, '/srv/never')).toEqual({ text: DEFAULT, changed: false });
  });

  it('matches a root written with a trailing slash', () => {
    const text = DEFAULT.replace('/tmp/remote-claude-workspaces', '/tmp/remote-claude-workspaces/');

    expect(removeRoot(text, '/tmp/remote-claude-workspaces').changed).toBe(true);
  });

  it('refuses to edit a document with no list of roots', () => {
    expect(() => addRoot('other: 1\n', { path: '/x', label: 'x', users: ['u'] })).toThrow(
      'no `roots` list',
    );
  });

  it('skips an entry that names no path', () => {
    const odd = 'roots:\n  - label: nameless\n    users: [u]\n';

    expect(removeRoot(odd, '/x').changed).toBe(false);
  });
});

describe('validate — plan 06, S-58', () => {
  const cases = [
    ['no roots at all', 'roots: []\n'],
    ['a root with no users', 'roots:\n  - { path: /srv, label: s, users: [] }\n'],
    ['a root with no label', 'roots:\n  - { path: /srv, users: [u] }\n'],
    ['something that is not a list', 'roots: nope\n'],
  ];

  it.each(cases)('refuses %s, exactly as the boot does', (_case, text) => {
    // The boot validates by this very schema object: a case invalid for one is invalid for both.
    expect(workspaceAllowlistSchema.safeParse(parseYaml(text)).success).toBe(false);
    expect(validate(text).length).toBeGreaterThan(0);
  });

  it('accepts the default and names nothing', () => {
    expect(validate(DEFAULT)).toEqual([]);
  });

  it('names the entry that is wrong', () => {
    expect(validate('roots:\n  - { path: /srv, label: s, users: [] }\n')).toEqual([
      expect.stringMatching(/^roots\[0\]\.users: /),
    ]);
  });

  it('says a document that is not YAML is not YAML', () => {
    expect(validate('roots: [unclosed\n')).toEqual([
      'the workspace allowlist is not a valid YAML document',
    ]);
  });
});

describe('which allowlist `pnpm dev` runs with — plan 06, D-09', () => {
  it('is the local copy when it exists and the variable was left at the default', () => {
    for (const env of [{}, { RC_WORKSPACE_ALLOWLIST_FILE: './infra/workspace-allowlist.yaml' }]) {
      expect(activeAllowlist(env, { root, localExists: true })).toEqual({
        file: LOCAL_ALLOWLIST_FILE,
        source: 'local',
      });
    }
  });

  it('is the default when there is no local copy', () => {
    expect(
      activeAllowlist({ RC_WORKSPACE_ALLOWLIST_FILE: ' ' }, { root, localExists: false }),
    ).toEqual({ file: ALLOWLIST_FILE, source: 'default' });
  });

  it('is whatever the variable was set to by hand, over the copy', () => {
    expect(
      activeAllowlist(
        { RC_WORKSPACE_ALLOWLIST_FILE: '/etc/rc/allowlist.yaml' },
        {
          root,
          localExists: true,
        },
      ),
    ).toEqual({ file: '/etc/rc/allowlist.yaml', source: 'configured' });
  });

  it('points the backend of `pnpm dev` at it', () => {
    expect(withActiveAllowlist({ OTHER: 'x' }, { root, localExists: true })).toEqual({
      OTHER: 'x',
      RC_WORKSPACE_ALLOWLIST_FILE: LOCAL_ALLOWLIST_FILE,
    });
  });

  it('keeps the local copy beside the default', () => {
    expect(path.dirname(LOCAL_ALLOWLIST_FILE)).toBe(path.dirname(ALLOWLIST_FILE));
    expect(path.basename(LOCAL_ALLOWLIST_FILE)).toBe('workspace-allowlist.local.yaml');
  });
});

describe('allowlistCheck — plan 06, S-61', () => {
  it('names the active file and why it is that one', () => {
    expect(allowlistCheck({}, { root, localExists: false }, () => DEFAULT)).toEqual({
      name: 'workspace allowlist',
      status: 'ok',
      detail: 'infra/workspace-allowlist.yaml (default)',
    });
  });

  it('fails, with the problems, on a file the backend would refuse', () => {
    const check = allowlistCheck({}, { root, localExists: true }, () => 'roots: []\n');

    expect(check).toMatchObject({
      status: 'fail',
      fix: expect.stringContaining('refuses to boot'),
    });
    expect(check.detail).toContain('(local)');
  });

  it('fails on a file it cannot read', () => {
    const check = allowlistCheck({}, { root, localExists: false }, () => {
      throw new Error('ENOENT');
    });

    expect(check.detail).toContain('cannot be read');
  });

  it('shows a file outside the repository by its absolute path', () => {
    const check = allowlistCheck(
      { RC_WORKSPACE_ALLOWLIST_FILE: '/etc/rc.yaml' },
      { root: '/etc/rc.yaml', localExists: false },
      () => DEFAULT,
    );

    expect(check.detail).toBe('/etc/rc.yaml (configured)');
  });
});

describe('signalBackend — plan 06, D-15', () => {
  /** @param {Partial<import('../../../scripts/lib/allowlist.mjs').ProcessProbe>} overrides */
  const probe = (overrides = {}) => {
    /** @type {[number, string][]} */
    const sent = [];
    return {
      sent,
      probe: {
        read: () => '4242\n',
        commandOf: () => 'node --import tsx/loader src/main.ts',
        kill: (/** @type {number} */ pid, /** @type {string} */ signal) => {
          sent.push([pid, signal]);
        },
        ...overrides,
      },
    };
  };

  it('sends SIGHUP to the backend the pid file names', () => {
    const { sent, probe: processes } = probe();

    expect(signalBackend('/repo/.run/backend.pid', processes)).toEqual({
      kind: 'signalled',
      pid: 4242,
    });
    expect(sent).toEqual([[4242, 'SIGHUP']]);
  });

  it('does nothing when the backend writes no pid file', () => {
    expect(signalBackend(null, probe().probe)).toEqual({ kind: 'off' });
  });

  it.each([
    ['there is no pid file', { read: () => null }],
    ['the file holds no number', { read: () => 'nonsense' }],
    ['the pid is not positive', { read: () => '0' }],
    ['no process has that pid any more', { commandOf: () => null }],
    ['the pid was handed to another program', { commandOf: () => 'bash' }],
  ])('finds no backend when %s — and signals nothing', (_case, overrides) => {
    const { sent, probe: processes } = probe(overrides);

    expect(signalBackend('/repo/.run/backend.pid', processes)).toEqual({ kind: 'noBackend' });
    expect(sent).toEqual([]);
  });

  it('finds no backend when it is gone between the look and the signal', () => {
    const { probe: processes } = probe({
      kill: () => {
        throw new Error('ESRCH');
      },
    });

    expect(signalBackend('/repo/.run/backend.pid', processes)).toEqual({ kind: 'noBackend' });
  });
});

describe('pidFileOf', () => {
  it('resolves the pid file against the repository', () => {
    expect(pidFileOf({ RC_PID_FILE: './.run/backend.pid' }, '/repo')).toBe(
      '/repo/.run/backend.pid',
    );
  });

  it.each([{}, { RC_PID_FILE: '' }, { RC_PID_FILE: 'off' }])('answers none for %o', (env) => {
    expect(pidFileOf(env, '/repo')).toBeNull();
  });
});

describe('parseArguments', () => {
  it('reads a command, a folder and the options', () => {
    expect(parseArguments(['add', '~/p', '--user', 'a', '--user', 'b', '--yes'])).toEqual({
      command: 'add',
      target: '~/p',
      users: ['a', 'b'],
      yes: true,
      problems: [],
    });
  });

  it('reads the short forms and help', () => {
    expect(parseArguments(['-h']).command).toBe('help');
    expect(parseArguments(['--help']).command).toBe('help');
    expect(parseArguments(['add', 'x', '-y']).yes).toBe(true);
  });

  it.each([
    [['--user'], '--user needs a subject'],
    [['add', 'x', '--user', ' '], '--user needs a subject'],
    [['--force'], 'unknown option --force'],
    [['delete', 'x'], 'unknown command delete'],
    [['add', 'x', 'y'], 'unexpected argument y'],
  ])('reports %o', (argv, problem) => {
    expect(parseArguments(argv).problems).toContain(problem);
  });
});
