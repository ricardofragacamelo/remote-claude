/** The whole output of a tool, as the route serves it: possibly cut, never silently. */
export interface ToolOutput {
  /** The output as text — its first and its last part when {@link truncated}. */
  readonly text: string;

  /** Whether the output was above the ceiling. */
  readonly truncated: boolean;

  /** The size of the whole output, in bytes of UTF-8. */
  readonly bytes: number;

  /** Where in {@link text} the head ends and the tail begins — only when {@link truncated}. */
  readonly cutAt?: number;
}

/** Whether the byte at `index` continues a character of UTF-8 rather than beginning one. */
function continues(bytes: Uint8Array, index: number): boolean {
  return (Number(bytes[index]) & 0b1100_0000) === 0b1000_0000;
}

/**
 * The output of a tool within a ceiling of bytes: whole when it fits, and otherwise its first and its
 * last half of the ceiling, with where the cut is (plan 22, D-08).
 *
 * Head **and** tail because the two outputs that grow past it read from opposite ends: a `Read` of a
 * file matters from its start, a build or a test from its end. Cut on bytes, which is what the ceiling
 * protects, and never inside a character: a half character at either edge is left out rather than shown
 * as garbage.
 */
export function clipOutput(text: string, maxBytes: number): ToolOutput {
  const encoded = new TextEncoder().encode(text);

  if (encoded.length <= maxBytes) {
    return { text, truncated: false, bytes: encoded.length };
  }

  const half = Math.floor(maxBytes / 2);
  let headEnd = half;
  while (headEnd > 0 && continues(encoded, headEnd)) {
    headEnd -= 1;
  }

  let tailStart = encoded.length - half;
  while (tailStart < encoded.length && continues(encoded, tailStart)) {
    tailStart += 1;
  }

  const decoder = new TextDecoder();
  const head = decoder.decode(encoded.subarray(0, headEnd));
  const tail = decoder.decode(encoded.subarray(tailStart));

  return { text: `${head}${tail}`, truncated: true, bytes: encoded.length, cutAt: head.length };
}
