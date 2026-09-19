import { isAbsolute } from 'node:path';
import { z } from 'zod';

import { ConfigurationError } from '@remote-claude/config';
import { Workspace, WorkspacePath } from '@domain/workspace';

/**
 * The allowlist file, as a schema.
 *
 * It is the one piece of configuration that does **not** live in an environment variable, and the
 * exception is declared: this list is the first line of defence of the product, it grows with a
 * comment per root and with the owner of each root, and changing it has to mean touching the disk
 * of the machine. See docs/plans/01-live-session/decisions.md#d-02 and
 * docs/architecture/shared/07-repository-layout.md#configuração-e-segredo.
 *
 * YAML rather than JSON for exactly one reason: a security boundary that cannot carry a comment
 * saying *why* a root is on it stops being reviewable the week it has six entries.
 */
const rootSchema = z.object({
  /** Absolute path of the root. Relative is refused here, not normalised into something absolute. */
  path: z.string().min(1),
  /** What the UI calls it. */
  label: z.string().min(1),
  /** OIDC subjects allowed to reach it. A root nobody may use is a typo, not a configuration. */
  users: z.array(z.string().min(1)).min(1),
});

export const workspaceAllowlistSchema = z.object({
  roots: z.array(rootSchema).min(1),
});

/** The file, as it is written. */
export type RawWorkspaceAllowlist = z.infer<typeof workspaceAllowlistSchema>;

/** The two questions the loader asks of the world, so a unit test can answer them itself. */
export interface AllowlistFileSystem {
  /** The file's text. Throws when it is missing or unreadable. */
  read(file: string): string;

  /**
   * The real path of the directory at `path` — every symlink resolved — or `null` when there is
   * nothing there or what is there is not a directory.
   *
   * The resolution happens here, at boot, and the **resolved** path is what the allowlist holds.
   * Otherwise a root that is itself a symlink would never contain anything: the candidate paths
   * resolve and the root does not, and every comparison fails. Resolving later instead, per
   * request, would make the security boundary depend on what the filesystem looked like at that
   * instant — the reload is explicit on purpose (D-02).
   */
  realDirectory(path: string): string | null;
}

/** Parses the YAML document, or reports that it is not a document. */
export type AllowlistParser = (text: string) => unknown;

/**
 * Reads the allowlist, or refuses to produce one.
 *
 * Every failure is fatal and every failure is reported at once: an operator who learns about one
 * bad root per restart is an operator who eventually stops reading the message. A backend running
 * with an allowlist it could not fully validate is worse than a backend that is down — down is
 * visible, and a root that silently vanished is not.
 *
 * @param file absolute path of the allowlist file
 * @param fs how the file and the roots are read
 * @param parse how the text becomes data
 * @throws {ConfigurationError} listing every problem, each naming the value and what was expected
 */
export function loadWorkspaceAllowlist(
  file: string,
  fs: AllowlistFileSystem,
  parse: AllowlistParser,
): readonly Workspace[] {
  const document = readDocument(file, fs, parse);
  const parsed = workspaceAllowlistSchema.safeParse(document);

  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${file}: roots${pathOf(issue.path)}: ${issue.message}`),
    );
  }

  const problems: string[] = [];
  const workspaces: Workspace[] = [];

  for (const [index, root] of parsed.data.roots.entries()) {
    const where = `${file}: roots[${String(index)}]`;

    // Checked on the raw value: `WorkspacePath.create` would refuse it too, but here the message
    // can name the entry of the file rather than a path the operator never typed.
    if (!isAbsolute(root.path)) {
      problems.push(`${where}.path: "${root.path}" must be absolute`);
      continue;
    }

    // A root that does not exist is almost always a typo, and a typo in this file either locks
    // someone out or — with one character different — opens something nobody meant to open.
    const real = fs.realDirectory(WorkspacePath.create(root.path).value);

    if (real === null) {
      problems.push(`${where}.path: "${root.path}" is not an existing directory`);
      continue;
    }

    workspaces.push(
      Workspace.declare({
        root: WorkspacePath.create(real),
        label: root.label,
        authorisedUsers: root.users,
      }),
    );
  }

  if (problems.length > 0) {
    throw new ConfigurationError(problems);
  }

  return workspaces;
}

/** The parsed file, or a `ConfigurationError` saying which of the two steps failed. */
function readDocument(file: string, fs: AllowlistFileSystem, parse: AllowlistParser): unknown {
  let text: string;

  try {
    text = fs.read(file);
  } catch {
    // Never the underlying message: it carries the absolute path of the server and, on some
    // systems, the surrounding directory listing.
    throw new ConfigurationError([`${file}: the workspace allowlist cannot be read`]);
  }

  try {
    return parse(text);
  } catch {
    throw new ConfigurationError([`${file}: the workspace allowlist is not a valid YAML document`]);
  }
}

/** `["roots", 0, "path"]` → `[0].path`, with the leading `roots` already printed by the caller. */
function pathOf(segments: readonly PropertyKey[]): string {
  return segments
    .slice(1)
    .map((segment) =>
      typeof segment === 'number' ? `[${String(segment)}]` : `.${String(segment)}`,
    )
    .join('');
}
