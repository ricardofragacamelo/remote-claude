import { describe, expect, it } from 'vitest';

import {
  VENDOR_NAMES,
  inspectAll,
  inspectSource,
} from '../../../scripts/lib/vendor-name-rules.mjs';

describe('the supplier-name rule', () => {
  it.each(VENDOR_NAMES.map((vendor) => vendor.name))('finds %s', (name) => {
    expect(inspectSource('a.ts', `const endpoint = '${name}';`)).toHaveLength(1);
  });

  it('does not care about case — a name is a name however it is spelled', () => {
    expect(inspectSource('a.ts', "const x = 'FireBase';")).toHaveLength(1);
  });

  it('finds a name in a comment, because prose couples just as well', () => {
    expect(inspectSource('a.ts', '// matches the local Keycloak realm')).toHaveLength(1);
  });

  it('says where it is, and what it costs', () => {
    const [finding] = inspectSource('backend/src/a.ts', "const a = 1;\nconst b = 'fcm';");

    expect(finding).toMatchObject({
      rule: 'vendor-name-outside-configuration',
      file: 'backend/src/a.ts',
      line: 2,
    });
    expect(finding?.detail).toContain('change of configuration');
  });

  it('reports every occurrence, not only the first', () => {
    expect(inspectSource('a.ts', "'fcm' + 'fcm' + 'apns'")).toHaveLength(3);
  });

  // A list that tries to cover every product a company sells becomes a list that flags the word
  // "cloud", and a rule that cries wolf is a rule somebody switches off.
  it.each(['cloud', 'authorization', 'notification', 'pushToken', 'provider'])(
    'leaves %s alone',
    (word) => {
      expect(inspectSource('a.ts', `const x = '${word}';`)).toEqual([]);
    },
  );

  // The boundary is on the left only: an identifier that starts with the name still names it.
  it('finds a supplier inside an identifier that starts with one', () => {
    expect(inspectSource('a.ts', 'const firebaseApp = init();')).toHaveLength(1);
    expect(inspectSource('a.ts', 'const auth0Client = build();')).toHaveLength(1);
  });

  it('leaves a word that merely ends with one alone', () => {
    expect(inspectSource('a.ts', "const x = 'myfirebase';")).toEqual([]);
  });

  it('answers nothing for a file that names nobody', () => {
    expect(inspectSource('a.ts', 'export const endpoint = config.push.endpoint;')).toEqual([]);
  });

  it('inspects a set of files, keeping which one each finding came from', () => {
    const findings = inspectAll([
      { file: 'a.ts', source: "'fcm'" },
      { file: 'b.dart', source: 'clean' },
      { file: 'c.ts', source: "'auth0'" },
    ]);

    expect(findings.map((finding) => finding.file)).toEqual(['a.ts', 'c.ts']);
  });
});
