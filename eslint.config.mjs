// The single ESLint configuration of the repository. Workspaces inherit it; there is no
// per-folder override, because style drift between modules produces noise diffs for anyone
// moving across them — see docs/architecture/shared/09-code-quality.md.
//
// Turning a rule off in this file is an architecture decision and requires an ADR. Suppressing
// one on a single line is allowed, and must carry a justification after `--`.
import js from '@eslint/js';
import { recommended as eslintComments } from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    name: 'remote-claude/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.husky/**',
      'mobile/**',
      '**/*.g.ts',
      '**/*.gen.ts',
    ],
  },

  js.configs.recommended,
  eslintComments,
  prettierConfig,

  {
    name: 'remote-claude/base',
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Every log goes through the structured logger of its module
      // (docs/architecture/shared/03-logging.md). Scripts print through scripts/lib/ui.mjs.
      'no-console': 'error',
      // Suppressing a rule is allowed; suppressing it in silence is not.
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },

  {
    name: 'remote-claude/typescript',
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Do not know the type? It is `unknown`, and you narrow it.
      '@typescript-eslint/no-explicit-any': 'error',
      // `@ts-ignore` is forbidden; `@ts-expect-error` is allowed with a description, because it
      // fails once the underlying problem is fixed and the debt resolves itself.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
    },
  },

  {
    name: 'remote-claude/node-scripts',
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', '*.mjs', '*.config.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    // Tests live outside the source tree, mirroring it — see
    // docs/architecture/shared/06-testing-strategy.md ("Onde o teste mora").
    name: 'remote-claude/no-test-in-src',
    files: ['**/src/**/*.{spec,test}.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Test files must not live inside src/. Move it to the mirrored path under test/unit or test/integration.',
        },
      ],
    },
  },
);
