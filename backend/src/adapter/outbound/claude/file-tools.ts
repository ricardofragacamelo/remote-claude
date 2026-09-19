/**
 * Which tools write to a file, and where.
 *
 * A table and not a guess: the hooks fire for every tool, and only a few of them change the disk.
 * Asking the wrong ones for a path would snapshot files nobody touched, and missing one would
 * leave the undo blind to a write that happened.
 *
 * Only the built-in file tools are listed. An MCP tool can write anywhere and says nothing about
 * it in its input, so it is deliberately out: promising undo for a path we cannot identify is
 * worse than saying plainly that we cannot.
 */
const PATH_FIELD_BY_TOOL: Readonly<Record<string, string>> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

/**
 * The absolute paths a tool invocation is about to change, or has just changed.
 *
 * Empty for every tool that does not write, which is most of them.
 */
export function pathsWrittenBy(toolName: string, input: unknown): string[] {
  const field = PATH_FIELD_BY_TOOL[toolName];

  if (field === undefined || typeof input !== 'object' || input === null) {
    return [];
  }

  const value = (input as Record<string, unknown>)[field];

  // A relative path here would be resolved against whatever the backend's working directory
  // happens to be, which is not the session's. Better no snapshot than one of the wrong file.
  return typeof value === 'string' && value.startsWith('/') ? [value] : [];
}
