import type {
  ProjectMcpClimbRequest,
  ProjectMcpFileRead,
  ProjectMcpServersSource,
} from '@application/mcp';

/**
 * A reader a test fills by hand, folder by folder — in memory, with no filesystem, no `.git` and no
 * allowlist boundary of its own: `climb()` simply walks the folders the test registered, from the
 * one named in the request up through every ancestor it has a file for, nearest first.
 */
export class FakeProjectMcpServersSource implements ProjectMcpServersSource {
  private readonly files = new Map<string, ProjectMcpFileRead>();

  /** Registers a file (or its absence, by never calling this) at exactly this folder. */
  set(folderPath: string, read: Omit<ProjectMcpFileRead, 'folderPath'>): void {
    this.files.set(folderPath, { folderPath, ...read });
  }

  async climb(request: ProjectMcpClimbRequest): Promise<readonly ProjectMcpFileRead[]> {
    const results: ProjectMcpFileRead[] = [];
    let current = request.folder;

    for (;;) {
      const read = this.files.get(current);
      if (read !== undefined) {
        results.push(read);
      }

      if (current === request.allowlistRoot) {
        break;
      }

      const parent = current.slice(0, current.lastIndexOf('/')) || '/';
      if (parent === current || parent.length < request.allowlistRoot.length) {
        break;
      }
      current = parent;
    }

    return results;
  }

  async readAt(folderPath: string): Promise<ProjectMcpFileRead | null> {
    return this.files.get(folderPath) ?? null;
  }
}
