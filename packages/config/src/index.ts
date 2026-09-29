/**
 * Reading configuration from an environment, and refusing it when it cannot be trusted.
 *
 * The backend and the browser build validate different variables, and they do it for the same
 * reason and in the same way: **no silent default**, every problem reported at once, and a process
 * that does not start rather than one that starts wrong. That rule lives here, once.
 *
 * The workspace allowlist's schema lives here too, because two readers validate that file — the
 * backend and `pnpm allowlist` — and one schema is what keeps them agreeing (plan 06, D-09).
 *
 * See docs/architecture/shared/07-repository-layout.md#configuração-e-segredo.
 */
export { ConfigurationError, parseEnvironment } from './environment';
export { workspaceAllowlistSchema, workspaceRootSchema } from './workspace-allowlist';
export type { RawWorkspaceAllowlist, RawWorkspaceRoot } from './workspace-allowlist';
