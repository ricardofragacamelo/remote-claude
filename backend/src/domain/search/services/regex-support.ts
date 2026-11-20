/**
 * A pattern that uses a feature outside the Rust regex grammar ripgrep compiles with — lookaround
 * or a backreference, both of which require backtracking, which is exactly what `--pcre2` would
 * turn on and ADR-016 never does (S-28). Checked on the pattern text itself, before any process
 * runs: a syntax error the engine's own grammar rejects for any other reason is the engine's to
 * report, with whatever position it gives.
 */
const UNSUPPORTED_REGEX_FEATURE = /\(\?<?[=!]|\\[1-9]|\\k[<']/;

export function hasUnsupportedRegexFeature(pattern: string): boolean {
  return UNSUPPORTED_REGEX_FEATURE.test(pattern);
}
