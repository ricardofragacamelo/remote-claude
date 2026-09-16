import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ESLint } from 'eslint';

/** The repository root: the rules are declared there, and file paths are matched against it. */
const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const eslint = new ESLint({ cwd: repoRoot });

// Resolving the flat configuration and loading every plugin takes seconds the first time. That
// cost belongs to the setup, not to the first assertion that happens to run.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

beforeAll(async () => {
  await eslint.lintText('export const warmUp = 1;\n', {
    filePath: path.join(repoRoot, 'web/src/shared/lib/warm-up.ts'),
  });
});

/**
 * The rule identifiers that fired on a snippet, at a given path.
 *
 * The configuration under test is the **real** one — no restatement of the rules here. A test that
 * described the rules again would pass while the configuration the build uses was wrong.
 */
async function rulesFiredOn(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });

  return (result?.messages ?? []).map((message) => message.ruleId ?? 'unknown');
}

const COMPONENT = 'web/src/features/session/components/Probe.tsx';
const SERVICE = 'web/src/features/session/services/probe.ts';
const HOOK = 'web/src/features/session/hooks/useProbe.ts';
const SHARED = 'web/src/shared/lib/probe.ts';

describe('the chain, as the build enforces it', () => {
  it('refuses a component importing the HTTP client', async () => {
    const fired = await rulesFiredOn(
      COMPONENT,
      "import { api } from '@/shared/api';\nexport const a = api;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });

  it('refuses a component importing a service directly', async () => {
    const fired = await rulesFiredOn(
      COMPONENT,
      "import { sendPing } from '../services/session.service';\nexport const a = sendPing;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });

  it('allows a component importing a hook, which is the whole point of the chain', async () => {
    const fired = await rulesFiredOn(
      COMPONENT,
      "import { useSessionStream } from '../hooks/useSessionStream';\nexport const a = useSessionStream;\n",
    );

    expect(fired).not.toContain('no-restricted-imports');
  });

  it('refuses a service importing React', async () => {
    const fired = await rulesFiredOn(
      SERVICE,
      "import { useState } from 'react';\nexport const a = useState;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });

  it('refuses a service importing a state library either', async () => {
    const fired = await rulesFiredOn(
      SERVICE,
      "import { create } from 'zustand';\nexport const a = create;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });

  it('allows a service importing the HTTP client — that is its job', async () => {
    const fired = await rulesFiredOn(
      SERVICE,
      "import { api } from '@/shared/api/api';\nexport const a = api;\n",
    );

    expect(fired).not.toContain('no-restricted-imports');
  });

  it('refuses reaching into another feature’s insides', async () => {
    const fired = await rulesFiredOn(
      HOOK,
      "import { useAuth } from '@/features/auth/hooks/useAuth';\nexport const a = useAuth;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });

  it('allows reaching another feature through its barrel', async () => {
    const fired = await rulesFiredOn(
      HOOK,
      "import { useAuth } from '@/features/auth';\nexport const a = useAuth;\n",
    );

    expect(fired).not.toContain('no-restricted-imports');
  });

  it('refuses shared/ importing a feature, even through the barrel', async () => {
    const fired = await rulesFiredOn(
      SHARED,
      "import { useAuth } from '@/features/auth';\nexport const a = useAuth;\n",
    );

    expect(fired).toContain('no-restricted-imports');
  });
});

describe('the rules that protect the user', () => {
  it('refuses a presentable literal in JSX', async () => {
    const fired = await rulesFiredOn(
      COMPONENT,
      'export function Probe(): React.JSX.Element {\n  return <p>Sign in to continue</p>;\n}\n',
    );

    expect(fired).toContain('react/jsx-no-literals');
  });

  it('allows text that came from a translation key', async () => {
    const fired = await rulesFiredOn(
      COMPONENT,
      "import { useTranslation } from 'react-i18next';\n" +
        'export function Probe(): React.JSX.Element {\n' +
        '  const { t } = useTranslation();\n' +
        "  return <p>{t('auth.signIn.title')}</p>;\n" +
        '}\n',
    );

    expect(fired).not.toContain('react/jsx-no-literals');
  });

  it('refuses writing anything to localStorage, where a token must never go', async () => {
    const fired = await rulesFiredOn(
      SERVICE,
      "export function keep(token: string): void {\n  localStorage.setItem('rc.token', token);\n}\n",
    );

    expect(fired).toContain('no-restricted-syntax');
  });

  it('allows sessionStorage, which is where the code verifier lives between two redirects', async () => {
    const fired = await rulesFiredOn(
      SERVICE,
      "export function keep(verifier: string): void {\n  sessionStorage.setItem('rc.pkce.verifier', verifier);\n}\n",
    );

    expect(fired).not.toContain('no-restricted-syntax');
  });

  it('refuses a test file living inside src/', async () => {
    const fired = await rulesFiredOn(
      'web/src/features/session/services/session.service.spec.ts',
      'export const nothing = 1;\n',
    );

    expect(fired).toContain('no-restricted-syntax');
  });
});
