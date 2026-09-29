import type { DirectoryRead, WorkspaceDirectoryLister } from '@application/workspace';
import type { DirectoryListingCriteria } from '@domain/workspace';

/** One call the use case made, as the lister saw it. */
export interface ListerCall {
  readonly path: string;
  readonly criteria: DirectoryListingCriteria;
  readonly limit: number;
}

/** A lister that answers what the test declared, and remembers what it was asked. */
export class ScriptedDirectoryLister implements WorkspaceDirectoryLister {
  readonly calls: ListerCall[] = [];

  constructor(
    private readonly answer: DirectoryRead = { kind: 'read', children: [], exhausted: true },
  ) {}

  read(path: string, criteria: DirectoryListingCriteria, limit: number): Promise<DirectoryRead> {
    this.calls.push({ path, criteria, limit });
    return Promise.resolve(this.answer);
  }
}
