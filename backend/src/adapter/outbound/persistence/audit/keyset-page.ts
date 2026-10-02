/**
 * A page of a trail, from the rows a query read — one **past** the page.
 *
 * The extra row says whether there is another page without a second query, and without the page
 * that has exactly `limit` rows left pointing at an empty one after it (S-71 of plan 03). The cursor
 * is the `seq` of the last row kept: the next page is everything below it. Both trails page this way.
 */
export function keysetPage<Row extends { readonly seq: number }, Item>(
  rows: readonly Row[],
  limit: number,
  toItem: (row: Row) => Item,
): { readonly records: Item[]; readonly nextCursor: number | null } {
  const kept = rows.slice(0, limit);
  const last = kept.at(-1);

  return {
    records: kept.map(toItem),
    nextCursor: rows.length > limit && last !== undefined ? last.seq : null,
  };
}
