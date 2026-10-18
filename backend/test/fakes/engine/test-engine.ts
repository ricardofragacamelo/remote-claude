/**
 * The fake engine of plan 28, B-43 — a second, honest {@link AgentEnginePort} the port contract
 * suite runs against, beside Claude's. It never ships: this whole folder lives under `backend/test/`
 * and nothing under `backend/src/` may import it (`no-test-engine-in-production`,
 * `dependency-cruiser.config.mjs`) — see `docs/architecture/backend/07-testing.md`.
 */

/**
 * The name this fake registers under — the `engine` of every conversation it opens, and the only
 * name `RC_ENGINES_ENABLED`/`RC_ENGINE_DEFAULT` could ever resolve it by. A production build never
 * registers an adapter for it, so the name is inert there (S-121).
 */
export const TEST_ENGINE = 'test';

/** What a screen would show for this engine, were it reachable from the UI (B-44, B-45). */
export const TEST_ENGINE_DISPLAY_NAME = 'Test agent';

/** The version this fake reports of itself — fixed, because it drives no real binary to ask. */
export const TEST_ENGINE_VERSION = '1.0.0';
