/**
 * How many bytes a base64 text decodes to — counted, never decoded.
 *
 * The image of a prompt travels as a marker with its size (plan 22, D-09); decoding megabytes only to
 * measure them would cost what the marker exists to avoid. Four characters are three bytes, less one
 * per `=` of padding. Whitespace a line-wrapped encoding carries is not data, and is not counted.
 */
export function base64Size(data: string): number {
  const compact = data.replace(/\s/g, '');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}
