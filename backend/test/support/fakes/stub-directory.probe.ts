import type { DirectoryInspection, WorkspaceDirectoryProbe } from '@application/workspace';

/** A filesystem that answers exactly what the test declared, and `missing` for everything else. */
export class StubDirectoryProbe implements WorkspaceDirectoryProbe {
  readonly asked: string[] = [];

  constructor(private readonly answers: Readonly<Record<string, DirectoryInspection>> = {}) {}

  /** A probe where every declared path is a directory that resolves to itself. */
  static directories(...paths: readonly string[]): StubDirectoryProbe {
    return new StubDirectoryProbe(
      Object.fromEntries(
        paths.map((path) => [
          path,
          { kind: 'present', realPath: path, isDirectory: true } as const,
        ]),
      ),
    );
  }

  inspect(path: string): Promise<DirectoryInspection> {
    this.asked.push(path);
    return Promise.resolve(this.answers[path] ?? { kind: 'missing' });
  }
}
