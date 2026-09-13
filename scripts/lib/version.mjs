/**
 * Comparing tool versions out of whatever a `--version` call happens to print.
 */

/**
 * First `x.y.z` found in a string, as numbers. `v22.16.0`, `Docker version 29.1.3, build …`
 * and `Flutter 3.44.4 • channel stable` all parse.
 *
 * @param {string} raw
 * @returns {[number, number, number] | null}
 */
export function parseVersion(raw) {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw);
  if (match === null) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')];
}

/**
 * Whether `raw` reports a version at or above `minimum`.
 *
 * @param {string} raw output of the tool
 * @param {string} minimum e.g. `22` or `9.1`
 * @returns {boolean}
 */
export function meetsMinimum(raw, minimum) {
  const actual = parseVersion(raw);
  const required = parseVersion(minimum.includes('.') ? minimum : `${minimum}.0`);

  if (actual === null || required === null) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    const left = actual[index] ?? 0;
    const right = required[index] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }

  return true;
}
