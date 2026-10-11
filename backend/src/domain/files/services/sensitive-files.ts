/**
 * The files of a folder that change what an agent may do — a project rule that goes past the gate,
 * a hook that is code the next session runs, the servers it starts.
 *
 * Editable, with a second step: writing, creating, moving or deleting one of them needs the
 * explicit confirmation, and the trail marks the fact `sensitive`
 * ([07 · D-15](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 *
 * The list is not the domain's: it is what each registered engine declares of its own configuration
 * (plan 28, B-35 — an agent that rewrites the configuration of **another** agent is a vector that
 * only exists once there are several), put together by the composition.
 */
export class SensitiveFiles {
  private constructor(readonly files: readonly string[]) {}

  /**
   * @param files paths relative to the open folder — repeated ones count once, in their first place
   */
  static of(files: Iterable<string>): SensitiveFiles {
    return new SensitiveFiles([...new Set(files)]);
  }

  /**
   * Whether a path relative to the open folder is one of them.
   *
   * Relative to the open folder, because that is where an agent reads a project's configuration
   * from: the session's `cwd` is the folder of the tab.
   */
  includes(relative: string): boolean {
    return this.files.includes(relative);
  }

  /**
   * Whether an operation on `relative` reaches one of them — the file itself, or a folder that holds
   * one: deleting or moving a configuration folder takes the files in it along, and passes through
   * the same step.
   */
  touchedBy(relative: string): boolean {
    return this.files.some(
      (sensitive) => sensitive === relative || sensitive.startsWith(`${relative}/`),
    );
  }
}
