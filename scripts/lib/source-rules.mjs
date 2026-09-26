/**
 * What every source-level product rule has in common.
 *
 * Two of them exist — the Agent SDK holes and the supplier names — and each one is a different
 * question about a file. What they share is the shape of the answer and the walk over a set of
 * files, and writing that twice is how the two reports start disagreeing about what a finding
 * looks like.
 */

/**
 * @typedef {object} Finding
 * @property {string} rule
 * @property {string} file
 * @property {number} line 1-based
 * @property {string} detail what is wrong, and what it costs
 */

/**
 * The 1-based line an index falls on.
 *
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
export function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Inspects a set of files with one rule.
 *
 * @param {readonly { file: string, source: string }[]} files
 * @param {(file: string, source: string) => Finding[]} inspectSource
 * @returns {Finding[]}
 */
export function inspectAll(files, inspectSource) {
  return files.flatMap((entry) => inspectSource(entry.file, entry.source));
}
