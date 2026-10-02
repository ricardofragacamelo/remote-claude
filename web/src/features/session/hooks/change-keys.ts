/** The keys of what a session changed, in one place: the list, a file of it, a tool's diff. */
export const changeKeys = {
  all: ['sessions', 'changes'] as const,
  of: (sessionId: string) => [...changeKeys.all, sessionId] as const,
  file: (sessionId: string, path: string) => [...changeKeys.of(sessionId), 'file', path] as const,
  tool: (sessionId: string, toolUseId: string) =>
    [...changeKeys.of(sessionId), 'tool', toolUseId] as const,
};
