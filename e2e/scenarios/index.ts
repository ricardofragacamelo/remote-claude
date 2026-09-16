import fs from 'node:fs';
import path from 'node:path';

/**
 * The scenarios both ends have to prove.
 *
 * They are JSON, not TypeScript, for one reason: the Flutter app has to read the same file. Its
 * end-to-end suite cannot live in `e2e/` — it needs an emulator and the Dart toolchain — so what
 * is shared is the **scenario**, and each end reads it in its own language. Two hand-written
 * copies of "the first pong carries seq 1" drift, and the divergence then shows up in production
 * instead of in a test. See docs/architecture/shared/06-testing-strategy.md.
 */

/** Credentials of a user of the local realm (infra/keycloak/realm-remote-claude.json). */
export interface ScenarioUser {
  readonly username: string;
  readonly password: string;
}

/** One scenario of the matrix, as both ends read it. */
export interface Scenario {
  /** `S-nn` of docs/plans/00-bootstrap/scenarios.md. */
  readonly id: string;
  readonly title: string;
  readonly user: ScenarioUser;
  /** What the run has to observe. Its shape is the scenario's own. */
  readonly expect: Readonly<Record<string, unknown>>;
}

const directory = import.meta.dirname;

/**
 * Reads one scenario by file name, without the extension.
 *
 * @throws {Error} when the file does not exist, which means the two ends have gone out of step
 */
export function scenario(name: string): Scenario {
  const file = path.join(directory, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Scenario;
}

/** Every shared scenario, for a test that checks the two ends cover the same set. */
export function scenarioNames(): string[] {
  return fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''))
    .sort();
}
