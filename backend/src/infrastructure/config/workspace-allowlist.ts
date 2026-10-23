import { isAbsolute } from 'node:path';

import { ConfigurationError, workspaceAllowlistSchema } from '@remote-claude/config';
import type { RawWorkspaceMarketplace } from '@remote-claude/config';
import { Workspace, WorkspacePath } from '@domain/workspace';

/*
 * The schema of the file lives in `@remote-claude/config`, where `pnpm allowlist` reads it too: one
 * schema for the boot and for the script that writes the local copy (plan 06, D-09, S-58).
 *
 * YAML rather than JSON for exactly one reason: a security boundary that cannot carry a comment
 * saying *why* a root is on it stops being reviewable the week it has six entries.
 */

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

/** A plugin marketplace the file declares (plan 13, B-47) — the schema's own shape, unchanged. */
export type DeclaredMarketplace = RawWorkspaceMarketplace;

/** What a parse of the file produces: the roots, and the marketplaces it may declare. */
export interface LoadedAllowlist {
  readonly workspaces: readonly Workspace[];
  readonly marketplaces: readonly DeclaredMarketplace[];
}

/**
 * Reads the allowlist, or refuses to produce one.
 *
 * Every failure is fatal and every failure is reported at once: an operator who learns about one
 * bad root per restart is an operator who eventually stops reading the message. A backend running
 * with an allowlist it could not fully validate is worse than a backend that is down — down is
 * visible, and a root that silently vanished is not. The same discipline covers `marketplaces`: an
 * absent section is the feature switched off, never an error; a present, malformed one fails the
 * boot exactly like a malformed root — collected into the same list of problems, reported once.
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
): LoadedAllowlist {
  const document = readDocument(file, fs, parse);
  const parsed = workspaceAllowlistSchema.safeParse(document);

  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${file}: ${pathOf(issue.path)}: ${issue.message}`),
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

  const seenMarketplaceNames = new Set<string>();
  for (const [index, marketplace] of (parsed.data.marketplaces ?? []).entries()) {
    const where = `${file}: marketplaces[${String(index)}]`;

    if (seenMarketplaceNames.has(marketplace.name)) {
      problems.push(`${where}.name: "${marketplace.name}" is declared more than once`);
      continue;
    }
    seenMarketplaceNames.add(marketplace.name);
  }

  if (problems.length > 0) {
    throw new ConfigurationError(problems);
  }

  return { workspaces, marketplaces: parsed.data.marketplaces ?? [] };
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

/** `["roots", 0, "path"]` → `roots[0].path`; `["marketplaces", 0, "name"]` → `marketplaces[0].name`. */
function pathOf(segments: readonly PropertyKey[]): string {
  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${String(segment)}]`;
      }
      return index === 0 ? String(segment) : `.${String(segment)}`;
    })
    .join('');
}
