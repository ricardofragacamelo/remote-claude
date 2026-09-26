/**
 * What of a `Read` invocation may leave the trail: where, and how much. Never what.
 *
 * The SDK's `FileReadInput` is exactly these four — the path, and the window of lines or pages —
 * and the contents of the file are in the tool's **result**, which the trail never stores. Naming
 * them rather than passing the input through is what keeps that true on the day an SDK release
 * adds a field to the input that carries some of the file.
 */
const READ_FIELDS = ['file_path', 'offset', 'limit', 'pages'] as const;

/**
 * The input of an invocation, as the query of the trail discloses it.
 *
 * Every tool's input goes out **exactly** as it was called — the trail keeps everything, and the
 * detail of an entry is what somebody reads to know what ran — with one exception: a `Read` never
 * hands back the contents of a file, only the path and the size of the window that was read
 * (docs/architecture/backend/03-modules.md#audit). An allowlist and not a denylist, because the
 * field that leaks is the one nobody thought to deny.
 */
export function disclosedInput(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (toolName !== 'Read') {
    return { ...input };
  }

  const disclosed: Record<string, unknown> = {};

  for (const field of READ_FIELDS) {
    if (field in input) {
      disclosed[field] = input[field];
    }
  }

  return disclosed;
}
