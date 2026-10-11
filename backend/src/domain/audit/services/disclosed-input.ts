import type { CanonicalTool } from '@domain/engine';

/**
 * The input of an invocation, as the query of the trail discloses it.
 *
 * Every call's input goes out **exactly** as it was called — the trail keeps everything, and the
 * detail of an entry is what somebody reads to know what ran — with one exception: a `file.read`
 * never hands back the contents of a file, only the path and the window that was read
 * (docs/architecture/backend/03-modules.md#audit). The contents are in the tool's **result**, which
 * the trail never stores.
 *
 * By the kind and the subject, which the engine's adapter normalised (plan 28, B-16): an allowlist
 * of canonical fields and not a denylist of the engine's, because the field that leaks is the one
 * nobody thought to deny — and an engine release that adds a field to its read cannot carry any of
 * the file out through here.
 */
export function disclosedInput(
  tool: Pick<CanonicalTool, 'kind' | 'subject'>,
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (tool.kind !== 'file.read') {
    return { ...input };
  }

  const { paths, window } = tool.subject;

  return {
    ...(paths === undefined ? {} : { paths: [...paths] }),
    ...(window === undefined ? {} : { window: { ...window } }),
  };
}
