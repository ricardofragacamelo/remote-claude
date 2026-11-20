/**
 * Resolves ripgrep's own `--replace` syntax (`$0`, `$5`, `$foo`, `${name}`, `$$`) ourselves,
 * never by running `--replace` through the engine.
 *
 * Measured (ADR-016's own method, not assumption): ripgrep's `--json` ignores `--replace`
 * entirely — "Other flags that control aspects of the standard output … -r/--replace … have no
 * effect when --json is set" (`rg --help`) — so the JSON stream never carries a substituted
 * value, only the original match. `$0` is safe: it is the whole match, which `--json` already
 * gives in `submatches[].text`. A numbered or named group ($1, $foo) needs that group's own
 * boundary, which `--json` never reports at all (measured against a pattern with real capture
 * groups) — resolving one would mean reimplementing Rust's regex engine, the second engine D-04
 * exists to avoid. `SearchPatternInvalidError('unsupported')` refuses it outright, the same
 * class already used for a pattern feature the engine never supports.
 */

/** `$$`, `$0`/`${0}`, a numbered group, a named group — one match per `$`-reference. */
const GROUP_REFERENCE = /\$(?:(\$)|\{([^}]*)\}|([A-Za-z0-9_]+))/g;

/** The token after `$`, braced or bare — `undefined` for the `$$` (literal `$`) form. */
function tokenOf(
  escaped: string | undefined,
  braced: string | undefined,
  bare: string | undefined,
): string | undefined {
  return escaped !== undefined ? undefined : (braced ?? bare);
}

/**
 * A capture-group reference this backend cannot resolve on its own — any `$`-reference other
 * than `$0`/`${0}` (the whole match) or the `$$` escape. Only matters when the pattern is a
 * regex: a literal pattern never has a capture group, numbered or named, so `$1` there resolves
 * the same way ripgrep itself resolves a group that does not exist — to nothing (S-82, S-96).
 */
export function hasUnsupportedGroupReference(replacement: string, isRegex: boolean): boolean {
  if (!isRegex) {
    return false;
  }
  for (const match of replacement.matchAll(GROUP_REFERENCE)) {
    const token = tokenOf(match[1], match[2], match[3]);
    if (token !== undefined && token !== '0') {
      return true;
    }
  }
  return false;
}

/**
 * [replacement] with every `$`-reference resolved against [matchedText] — `$0`/`${0}` becomes
 * the whole match, `$$` becomes a literal `$`, and any other reference (only reachable when the
 * pattern is literal — a regex one is refused upstream by {@link hasUnsupportedGroupReference})
 * becomes empty, exactly as ripgrep itself resolves a group that does not exist (S-82, S-96).
 */
export function resolvedReplacementOf(replacement: string, matchedText: string): string {
  return replacement.replace(
    GROUP_REFERENCE,
    (
      _whole: string,
      escaped: string | undefined,
      braced: string | undefined,
      bare: string | undefined,
    ) => {
      const token = tokenOf(escaped, braced, bare);
      if (token === undefined) {
        return '$';
      }
      return token === '0' ? matchedText : '';
    },
  );
}
