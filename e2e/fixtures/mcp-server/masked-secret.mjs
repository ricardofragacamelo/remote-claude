/**
 * How the fixture MCP server says a secret arrived without ever saying it: the length and the
 * first 12 hex characters of its sha256. Its own module, so a test or the spike can compute the
 * expected answer without starting the server ([plan 13 · D-19](../../../docs/plans/13-claude-settings/decisions.md#d-19--servidor-mcp-de-fixture)).
 */

import { createHash } from 'node:crypto';

/** @param {string | undefined} value */
export function maskedSecret(value) {
  if (value === undefined || value === '') {
    return 'unset';
  }
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `set length=${value.length} sha256=${digest}`;
}
