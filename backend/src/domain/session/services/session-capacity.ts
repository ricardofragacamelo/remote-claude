/** What the number of concurrent sessions is derived from. */
export interface CapacityInputs {
  /** The RAM this process may use: the machine's, or the container's limit when there is one. */
  readonly memoryBytes: number;

  /** Share of that RAM the sessions may take together, in `(0, 1]`. */
  readonly memoryFraction: number;

  /** What one session is assumed to cost. ~222 MB was measured; the default leaves a margin. */
  readonly perSessionBytes: number;

  /** Never fewer than this, however little RAM there is. */
  readonly floor: number;

  /** Never more than this, however much RAM there is. */
  readonly ceiling: number;
}

/**
 * How many sessions this machine can hold at once.
 *
 * `floor(RAM × fraction / cost)`, held between the floor and the ceiling. A pure rule and no I/O,
 * on purpose: the RAM is read once, at boot, by whoever wires the registry, and the arithmetic —
 * where the boundaries live — is tested here with numbers instead of with machines
 * ([D-01](../../../../../docs/plans/05-hardening-operations/decisions.md)).
 *
 * **The total and not what is free.** Free memory moves with everything else the machine runs, so
 * a limit read from it would admit a session at one instant and refuse the same one a second
 * later, and closing a session would not reliably free its slot (S-03). The fraction is what
 * leaves room for the rest of the machine; the ceiling is what keeps a large one sane.
 *
 * The floor wins over the RAM: a machine too small for one session by this arithmetic still gets
 * one, because a backend that can open nothing is not a backend. Setting the floor is the
 * operator saying so.
 */
export function sessionCapacity(inputs: CapacityInputs): number {
  const fits = Math.floor((inputs.memoryBytes * inputs.memoryFraction) / inputs.perSessionBytes);

  return Math.min(inputs.ceiling, Math.max(inputs.floor, fits));
}
