/**
 * The files of a folder that change what an agent may do — the list is each registered engine's own
 * (`backend/src/domain/files/services/sensitive-files.ts`, plan 28, B-35), put together the same way
 * here: an `allow` rule in the project settings goes past the permission prompt in a trusted folder,
 * and a hook there is code that runs in the next session
 * ([07 · D-15](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 * The core knows none by name — an engine's extension registers its own, the same way it registers a
 * section of the settings screen.
 *
 * In `shared/` because the editor (saving), the explorer (renaming, moving, deleting) and the
 * agent's settings screen all ask the second step for the same files. The server refuses without
 * the confirmation either way (`428`, `reason: sensitiveFile`): this registry only lets the screen
 * ask first, and say **what** the file controls.
 */
import { createRegistry } from './registry';
import type { Registry, RegistryEntry } from './registry';

/** What a sensitive file controls. */
export type SensitiveSubject = 'projectSettings' | 'localSettings' | 'mcpServers';

/** One file an engine declares as its own, with what it controls. */
export interface SensitiveFileEntry extends RegistryEntry {
  /** Relative to the open folder — the engine's own configuration file. */
  readonly path: string;
  readonly subject: SensitiveSubject;
}

/** A registry of its own — the app has one; a test builds another. */
export function createSensitiveFiles(
  declared: readonly SensitiveFileEntry[] = [],
): Registry<SensitiveFileEntry> {
  return createRegistry('sensitive files', declared);
}

/** The sensitive files of every engine registered — none of the core's own. */
export const sensitiveFiles = createSensitiveFiles();

/**
 * What a path relative to the open folder controls, when it is one of the files — `null` otherwise.
 *
 * @param registry the app's own, unless a test asks of another
 */
export function sensitiveSubject(
  relative: string,
  registry: Registry<SensitiveFileEntry> = sensitiveFiles,
): SensitiveSubject | null {
  return registry.entries().find((entry) => entry.path === relative)?.subject ?? null;
}

/**
 * Whether an operation on `relative` reaches one of them — the file itself, or a folder that holds
 * one: moving or deleting the folder of a settings file takes the file with it.
 *
 * @param registry the app's own, unless a test asks of another
 */
export function touchesSensitive(
  relative: string,
  registry: Registry<SensitiveFileEntry> = sensitiveFiles,
): boolean {
  return registry
    .entries()
    .some(({ path }) => path === relative || path.startsWith(`${relative}/`));
}
