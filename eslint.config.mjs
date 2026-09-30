// The single ESLint configuration of the repository. Workspaces inherit it; there is no
// per-folder override, because style drift between modules produces noise diffs for anyone
// moving across them — see docs/architecture/shared/09-code-quality.md.
//
// Turning a rule off in this file is an architecture decision and requires an ADR. Suppressing
// one on a single line is allowed, and must carry a justification after `--`.
import js from '@eslint/js';
import { recommended as eslintComments } from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettierConfig from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * A feature is reached through its barrel, never through a deep path.
 *
 * Stated once and reused by every scope below: four copies of a rule are four places for it to
 * drift, and the duplication gate is there to say so.
 */
const CROSS_FEATURE = {
  group: ['@/features/*/*', '@/features/*/*/**'],
  message:
    'no-cross-feature-internals: another feature is reached through its barrel (`@/features/x`), never through a deep path.',
};

/**
 * Icons come from `lucide-react` and nowhere else: one set, one stroke, one way to label them
 * (docs/architecture/web/03-ui-system.md#o-sistema-visual). Reused by every scope of the web below.
 */
const OTHER_ICONS = {
  group: [
    'react-icons',
    'react-icons/*',
    '@heroicons/*',
    '@radix-ui/react-icons',
    '@tabler/icons-react',
    '@mui/icons-material',
    '@mui/icons-material/*',
    '@phosphor-icons/*',
    'phosphor-react',
    '@fortawesome/*',
    'react-feather',
    'lucide',
  ],
  message:
    'icons-only-lucide: the web draws its icons from `lucide-react` alone, so every control that is only an icon looks and is labelled the same way.',
};

/** A token in `localStorage` is a token any script on the page can read — see the scope below. */
const TOKEN_IN_WEB_STORAGE = {
  selector: 'CallExpression[callee.object.name="localStorage"][callee.property.name="setItem"]',
  message:
    'localStorage is readable by any script on the page. A credential belongs in memory, or in an httpOnly cookie.',
};

/**
 * A colour is a role token (`bg-destructive`), never a shade (`bg-red-500`) nor a literal
 * (`bg-[#f00]`): a shade breaks the dark theme, and a rebrand becomes a search-and-replace
 * (docs/architecture/web/03-ui-system.md#token-semântico-nunca-cor-literal).
 */
const LITERAL_COLOUR =
  '/\\b(bg|text|border|ring|fill|stroke|outline|divide|from|via|to|shadow|decoration|accent|caret|placeholder)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)\\b|-\\[(#|rgb|hsl|oklch|color)/';

const LITERAL_COLOUR_MESSAGE =
  'no-literal-colour: use the role token of the theme (`bg-destructive`, `text-muted-foreground`), never a shade or a literal colour.';

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
      // At most 10 paths through a function, on every end and in the scripts: the bar the
      // SonarQube gate would have held, and the one `mobile.mjs analyze` holds for Dart. Split
      // the function rather than raise it — D-10 of docs/plans/05-hardening-operations.
      complexity: ['error', 10],
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
    // The chain `Component → Hook → Service → api.ts` of docs/architecture/web/01-architecture.md,
    // as lint. Each block below is one line of the table in
    // docs/architecture/shared/09-code-quality.md#web--eslint-plugin-boundaries, and a violation
    // breaks the build — a structural rule nobody verifies is folklore.
    //
    // These are `no-restricted-imports` and not `eslint-plugin-boundaries` on purpose: on this
    // repository the plugin's v7 policy API classified no file at all and reported success without
    // looking at anything, which is worse than having no gate. See the decision recorded in
    // docs/plans/00-bootstrap/progress.md. `web/test/unit/architecture` proves each rule fires.
    name: 'remote-claude/web-chain-components',
    files: ['web/src/features/*/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/shared/api', '@/shared/api/*', '**/services/*', '**/services'],
              message:
                'no-api-in-components: a component talks to a hook. Four reasons to change collapse into one file otherwise, and every one of them then means editing JSX.',
            },
            CROSS_FEATURE,
            OTHER_ICONS,
          ],
        },
      ],
    },
  },

  {
    name: 'remote-claude/web-chain-services',
    files: ['web/src/features/*/services/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                '@tanstack/react-*',
                'zustand',
                '**/hooks/*',
                '**/components/*',
              ],
              message:
                'no-react-in-services: a service is an async function with no React in it, which is what makes testing it a call rather than a render.',
            },
            CROSS_FEATURE,
          ],
        },
      ],
    },
  },

  {
    name: 'remote-claude/web-chain-feature-internals',
    files: ['web/src/features/*/{hooks,store,types}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [CROSS_FEATURE],
        },
      ],
    },
  },

  {
    name: 'remote-claude/web-shared-is-the-bottom',
    files: ['web/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features', '@/features/**', '../features/**', '../../features/**'],
              message:
                'shared-cannot-import-features: shared/ is the bottom of the stack. The arrow points at it, never away from it.',
            },
            OTHER_ICONS,
          ],
        },
      ],
    },
  },

  {
    // The app layer composes screens and draws the frame: the same one set of icons.
    name: 'remote-claude/web-app-icons',
    files: ['web/src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [OTHER_ICONS] }],
    },
  },

  {
    name: 'remote-claude/web-react',
    files: ['web/src/**/*.{ts,tsx}', 'web/test/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Nothing a person can read is born hardcoded: it comes from a key, in `en` and `pt-BR`.
      // See docs/architecture/shared/02-i18n.md.
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true, allowedStrings: [] },
      ],
      'react/jsx-key': 'error',
      'react/no-danger': 'error',
    },
  },

  {
    // A token in `localStorage` is a token any script on the page can read, which turns one XSS
    // into a session that outlives the tab. See docs/architecture/web/07-auth.md.
    name: 'remote-claude/no-token-in-web-storage',
    files: ['web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', TOKEN_IN_WEB_STORAGE],
    },
  },

  {
    // Where the interface is drawn, a colour is a role of the theme — plan 06, S-87. The generated
    // primitives of `components/ui/` are the generator's, and use the tokens already. Repeats the
    // storage rule because a scope's `no-restricted-syntax` replaces the one above it.
    name: 'remote-claude/no-literal-colour',
    files: [
      'web/src/features/*/components/**/*.tsx',
      'web/src/app/**/*.tsx',
      'web/src/shared/components/*.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        TOKEN_IN_WEB_STORAGE,
        { selector: `Literal[value=${LITERAL_COLOUR}]`, message: LITERAL_COLOUR_MESSAGE },
        {
          selector: `TemplateElement[value.raw=${LITERAL_COLOUR}]`,
          message: LITERAL_COLOUR_MESSAGE,
        },
      ],
    },
  },

  {
    // The end-to-end suite reaches the system through the door a user goes through: HTTP, the
    // WebSocket and the UI. Importing the inside of `backend/src` or `web/src` turns it into an
    // integration test in disguise — it would then pass against code that no deployed artefact
    // runs, which is the one thing this level exists to rule out.
    //
    // `packages/contracts` is deliberately allowed: it *is* the published contract, and checking
    // frames against the same generated guard the three ends use is the point.
    name: 'remote-claude/e2e-through-the-front-door',
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/backend/src/**', '**/web/src/**', '@/features/**', '@infra/**'],
              message:
                'e2e-through-the-front-door: the end-to-end suite talks to the running system over HTTP, WebSocket and the UI. Reach for `packages/contracts` when you need the protocol.',
            },
          ],
        },
      ],
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
