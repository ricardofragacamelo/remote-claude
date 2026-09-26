/**
 * The vendor names that may not appear in the product's source.
 *
 * Two integrations of this system talk to a named company — the identity provider and the push
 * provider — and the rule for both is the same: **the name does not leave the configuration**.
 * What the code knows is an issuer, an endpoint and a credential file, all of them values; what
 * it must never know is who is on the other end, because that is what makes changing provider a
 * change of one variable rather than a refactor
 * ([AGENTS.md](../../AGENTS.md), docs/architecture/shared/08-authentication.md).
 *
 * No generic scanner knows about this, which is why it is written here rather than configured.
 * It is the check `02 · S-26` asks for.
 */

import { inspectAll as inspectWith, lineAt } from './source-rules.mjs';

/** @typedef {import('./source-rules.mjs').Finding} Finding */

/**
 * Names that identify a supplier, matched case-insensitively from a word boundary.
 *
 * The boundary is on the **left** only, and that is deliberate: `firebaseApp` and `auth0Client`
 * name a supplier exactly as much as `firebase` does, and a pattern closed on both sides would
 * miss every identifier anybody actually writes.
 *
 * The list is deliberately short. One that tried to cover every product a company sells would
 * end up flagging the word "cloud", and a rule that cries wolf is a rule somebody switches off.
 *
 * @type {readonly { name: string, pattern: RegExp }[]}
 */
export const VENDOR_NAMES = [
  { name: 'fcm', pattern: /\bfcm/i },
  { name: 'firebase', pattern: /\bfirebase/i },
  { name: 'googleapis', pattern: /\bgoogleapis/i },
  { name: 'apns', pattern: /\bapns/i },
  { name: 'auth0', pattern: /\bauth0/i },
  { name: 'okta', pattern: /\bokta/i },
  { name: 'keycloak', pattern: /\bkeycloak/i },
];

/**
 * Every vendor name in one file.
 *
 * @param {string} file repository-relative path, for the report
 * @param {string} source
 * @returns {Finding[]}
 */
export function inspectSource(file, source) {
  /** @type {Finding[]} */
  const findings = [];

  for (const vendor of VENDOR_NAMES) {
    const pattern = new RegExp(vendor.pattern.source, 'gi');
    let match;

    while ((match = pattern.exec(source)) !== null) {
      findings.push({
        rule: 'vendor-name-outside-configuration',
        file,
        line: lineAt(source, match.index),
        detail:
          `"${match[0]}" names a supplier. The code knows an endpoint and a credential, never ` +
          'who answers them — that is what makes changing provider a change of configuration',
      });
    }
  }

  return findings;
}

/**
 * Inspects a set of files.
 *
 * @param {readonly { file: string, source: string }[]} files
 * @returns {Finding[]}
 */
export function inspectAll(files) {
  return inspectWith(files, inspectSource);
}
