/**
 * Which folder tab each attached session belongs to — what a notification about it names, and where
 * a click on it leads (plan 08, B-42). Written by whatever keeps the sessions of a tab attached.
 */
const folders = new Map<string, string>();

export function noteSessionFolder(sessionId: string, folder: string): void {
  folders.set(sessionId, folder);
}

/** The folder tab a session belongs to — `null` for one in none, or a frame that names no session. */
export function folderOfSession(sessionId: string | undefined): string | null {
  return sessionId === undefined ? null : (folders.get(sessionId) ?? null);
}

export function forgetSessionFolders(): void {
  folders.clear();
}
