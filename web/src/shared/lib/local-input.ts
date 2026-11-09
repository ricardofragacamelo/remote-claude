/**
 * An ISO instant as a local, zone-less input value (`datetime-local`'s `YYYY-MM-DDTHH:mm`, or
 * `date`'s `YYYY-MM-DD` — `length` is which), in the zone of this browser. `''` for none, or for a
 * value that does not parse.
 */
export function localInputOf(iso: string | undefined, length: number): string {
  if (iso === undefined) {
    return '';
  }

  const instant = new Date(iso);

  if (Number.isNaN(instant.getTime())) {
    return '';
  }

  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, length);
}
