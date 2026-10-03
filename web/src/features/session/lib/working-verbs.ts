/**
 * What the indicator of a turn says Claude is doing while nothing more precise is known (plan 09,
 * D-16): one verb per turn, drawn from this list — each a key of `sessions.workingVerb`, in every
 * language of the catalogue.
 */
export const WORKING_VERBS = [
  'pondering',
  'deciphering',
  'mulling',
  'reasoning',
  'weighing',
  'sketching',
  'untangling',
  'assembling',
  'tinkering',
  'exploring',
  'connecting',
  'distilling',
  'brewing',
  'crafting',
  'investigating',
  'puzzling',
  'considering',
  'computing',
  'working',
  'musing',
] as const;

export type WorkingVerb = (typeof WORKING_VERBS)[number];

/**
 * The verb of one turn: drawn from what names the turn — the session and how many turns ended before
 * it —, never from the clock. The same turn draws the same verb however often it is drawn again, after
 * a re-render, a switch of tab or a reconnect (S-53); the next turn may draw another.
 */
export function verbOf(turn: string): WorkingVerb {
  const hash = Array.from(turn).reduce(
    (sum, char) => (sum * 31 + char.charCodeAt(0)) % 2_147_483_647,
    0,
  );
  const drawn = hash % WORKING_VERBS.length;

  return WORKING_VERBS.reduce<WorkingVerb>(
    (chosen, verb, index) => (index === drawn ? verb : chosen),
    WORKING_VERBS[0],
  );
}
