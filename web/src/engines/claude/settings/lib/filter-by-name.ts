/** Narrows `items` to the ones whose name contains `search`, case-insensitively — every searchable
 * list of the Project section's own cards (plan 13, B-33, B-36). */
export function filterByName<T>(
  items: readonly T[],
  search: string,
  nameOf: (item: T) => string,
): readonly T[] {
  const query = search.trim().toLowerCase();
  return query === '' ? items : items.filter((item) => nameOf(item).toLowerCase().includes(query));
}
