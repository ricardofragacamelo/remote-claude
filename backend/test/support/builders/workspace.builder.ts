import { Workspace, WorkspaceAllowlist, WorkspacePath } from '@domain/workspace';

/** The subject most workspace tests speak as. */
export const OWNER = 'auth|owner';

/** A declared root with sensible defaults, so a test states only what it cares about. */
export function aWorkspace(
  overrides: { root?: string; label?: string; users?: readonly string[] } = {},
): Workspace {
  return Workspace.declare({
    root: WorkspacePath.create(overrides.root ?? '/srv/projects'),
    label: overrides.label ?? 'Projects',
    authorisedUsers: overrides.users ?? [OWNER],
  });
}

/** An allowlist over the given roots, or over one default root. */
export function anAllowlist(workspaces: readonly Workspace[] = [aWorkspace()]): WorkspaceAllowlist {
  return new WorkspaceAllowlist(workspaces);
}
