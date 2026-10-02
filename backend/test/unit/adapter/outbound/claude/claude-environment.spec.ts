import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { claudeEnvironment, isBackendVariable } from '@adapter/outbound/claude/claude-environment';
import { processEnvironment } from '@infra/config/process-environment';

/** The one variable `.env.example` declares that the CLI needs: where its login lives. */
const NEEDED_BY_THE_CLI = new Set(['CLAUDE_CONFIG_DIR']);

/** Every name `.env.example` declares — the file `pnpm dev` loads into the backend's process. */
function declaredInEnvExample(): string[] {
  const file = fileURLToPath(new URL('../../../../../../.env.example', import.meta.url));

  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

describe('claudeEnvironment — 12 · B-13, D-10', () => {
  it('takes out every key of the configuration schema — S-108', () => {
    // Held against the schema itself and not a list typed here, so a configuration key added
    // tomorrow without one of the prefixes fails this gate instead of reaching Claude.
    const escaped = Object.keys(processEnvironment()).filter((name) => !isBackendVariable(name));

    expect(escaped).toEqual([]);
  });

  it('takes out everything `.env.example` declares but the login directory — S-108', () => {
    // `.env.example` carries more than the schema reads: the compose passwords live there too.
    const escaped = declaredInEnvExample().filter(
      (name) => !NEEDED_BY_THE_CLI.has(name) && !isBackendVariable(name),
    );

    expect(escaped).toEqual([]);
  });

  it('removes the passwords and the connection string from what the CLI is given', () => {
    const child = claudeEnvironment({
      DATABASE_URL: 'postgres://user:secret@localhost/db',
      RC_POSTGRES_PASSWORD: 'secret',
      RC_KEYCLOAK_ADMIN_PASSWORD: 'secret',
      OIDC_ISSUER: 'http://localhost:8080/realms/x',
      PGPASSWORD: 'secret',
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      PATH: '/usr/bin',
    });

    expect(child).toEqual({ PATH: '/usr/bin' });
  });

  it('keeps what the CLI needs from the machine — S-109', () => {
    const machine = {
      HOME: '/home/me',
      PATH: '/usr/bin',
      CLAUDE_CONFIG_DIR: '/home/me/.claude',
      HTTPS_PROXY: 'http://proxy:3128',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/ca.pem',
      ANTHROPIC_API_KEY: 'the-users-own',
      CLAUDE_CODE_USE_BEDROCK: '1',
      // Which form the task list takes — the CLI's to read (plan 08, D-25).
      CLAUDE_CODE_ENABLE_TASKS: '0',
      LANG: 'pt_BR.UTF-8',
    };

    expect(claudeEnvironment(machine)).toEqual(machine);
  });

  it('matches by prefix at the start of the name, not anywhere in it', () => {
    // A user variable that merely contains one of our prefixes is not ours.
    expect(isBackendVariable('MY_RC_THING')).toBe(false);
    expect(isBackendVariable('NODE_ENVIRONMENT')).toBe(false);
    expect(isBackendVariable('PGHOST')).toBe(true);
  });

  it('never touches the environment it was given', () => {
    const backend = { DATABASE_URL: 'postgres://x', PATH: '/usr/bin' };

    claudeEnvironment(backend);

    expect(backend).toEqual({ DATABASE_URL: 'postgres://x', PATH: '/usr/bin' });
  });

  it('keeps a variable the machine left undefined as it was', () => {
    expect(claudeEnvironment({ TERM: undefined })).toEqual({ TERM: undefined });
  });
});
