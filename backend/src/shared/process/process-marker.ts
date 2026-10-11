/**
 * The mark every CLI subprocess of ours carries, so the boot can find the ones a dead backend left.
 *
 * Two variables in the subprocess's environment: that it is ours, and which backend started it.
 * The CLI survives its parent — measured — and a backend that dies without calling `close()`
 * leaves ~222 MB running for nobody. The next boot looks for the mark (B-03).
 *
 * **The mark and not the binary name.** A sweep that matched the name of an agent's binary would
 * kill the one the user has open in a terminal; a sweep that matches our variable can only find what
 * we started — and the tools that subprocess ran, which inherit it and die with it (S-07). The mark
 * is the product's, so it is the same for every engine (ADR-025).
 */
export const PROCESS_MARKER = {
  /** Present, with {@link OWNER_VALUE}, on every subprocess this backend spawns. */
  owner: 'REMOTE_CLAUDE_OWNER',

  /** The pid of the backend that spawned it. A dead one is what makes the subprocess an orphan. */
  parentPid: 'REMOTE_CLAUDE_PARENT_PID',
} as const;

/** The value of the owner variable. A variable merely named the same is not enough. */
export const OWNER_VALUE = 'remote-claude-backend';

/**
 * The environment a CLI subprocess is started with: the one it is given, plus the mark.
 *
 * What it is given is already filtered by the adapter of its engine, which takes the backend's
 * configuration out and keeps the machine's, the login included. This only adds the mark.
 */
export function markedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  parentPid: number,
): Record<string, string | undefined> {
  return {
    ...environment,
    [PROCESS_MARKER.owner]: OWNER_VALUE,
    [PROCESS_MARKER.parentPid]: String(parentPid),
  };
}
