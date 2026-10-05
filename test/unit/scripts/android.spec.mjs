import { describe, expect, it } from 'vitest';

import {
  EMULATOR_API_LEVEL,
  apiLevelProblem,
  suiteFailures,
  suiteProblem,
  suiteTargets,
} from '../../../scripts/lib/android.mjs';

describe('apiLevelProblem', () => {
  it('accepts the fixed image, whatever whitespace adb prints around it', () => {
    expect(apiLevelProblem('35\r\n')).toBeNull();
  });

  // S-67 — an older image passes the suite without showing the notification dialog it exercises.
  it('refuses any other level, saying both numbers', () => {
    expect(apiLevelProblem('33')).toBe('the device runs API 33, and the suite is fixed on API 35');
    expect(apiLevelProblem('36')).toContain('API 36');
  });

  it('refuses an answer that is not a level at all', () => {
    expect(apiLevelProblem('error: no devices')).toContain('did not say');
  });

  it('is fixed on API 35', () => {
    expect(EMULATOR_API_LEVEL).toBe(35);
  });
});

describe('suiteProblem', () => {
  it('accepts a flutter run that reports passing tests', () => {
    expect(suiteProblem('flutter', '01:30 +6: All tests passed!')).toBeNull();
  });

  // The run of 2026-09-24 that installed the app and exited 0 with nothing in between.
  it('refuses a flutter run with no report of a passing test', () => {
    expect(
      suiteProblem('flutter', 'Installing build/app/outputs/flutter-apk/app-debug.apk...'),
    ).toBe('the flutter run exited 0, and its report shows no test that passed');
  });

  it('accepts a patrol run with at least one success, and refuses one with none', () => {
    expect(suiteProblem('patrol', '✅ Successful: 1\n❌ Failed: 0')).toBeNull();
    expect(suiteProblem('patrol', '📝 Total: 0\n✅ Successful: 0')).not.toBeNull();
  });
});

// Plan 10, F10: one suite at a time while it is being written.
describe('suiteTargets', () => {
  const available = ['folders_test.dart', 'connection_test.dart', 'limits_test.dart'];

  it('runs the whole directory when no suite is named', () => {
    expect(suiteTargets([], available)).toEqual({ targets: ['integration_test'], problem: null });
  });

  it('takes a suite by any of the names a person gives it', () => {
    expect(
      suiteTargets(
        [
          'folders',
          'connection_test',
          'limits_test.dart',
          'integration_test/folders_test.dart',
          './integration_test/connection',
        ],
        available,
      ).targets,
    ).toEqual([
      'integration_test/folders_test.dart',
      'integration_test/connection_test.dart',
      'integration_test/limits_test.dart',
      'integration_test/folders_test.dart',
      'integration_test/connection_test.dart',
    ]);
  });

  it('refuses a name that matches no suite, saying which exist', () => {
    const { targets, problem } = suiteTargets(['folder', 'limits'], available);

    expect(targets).toBeNull();
    expect(problem).toContain('folder_test.dart');
    expect(problem).toContain('connection_test.dart, folders_test.dart, limits_test.dart');
  });
});

// Plan 10, F10: which tests a red device run failed, and why, without reading its whole output.
describe('suiteFailures', () => {
  const output = [
    '00:46 +1: /m/integration_test/permission_flow_test.dart: 02·S-55 — a phone still waiting',
    '══╡ EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK ╞════════════════',
    'The following TestFailure was thrown running a test:',
    'Expected: (int, String):<(409, OPEN_FOLDERS_LIMIT_REACHED)>',
    '  Actual: (int, Null):<(409, null)>',
    '',
    'The test description was:',
    '  10·S-178 — past the ceiling of open folders, opening one more is',
    '  refused with the ceiling',
    '════════════════',
    '01:34 +2 -4: /m/integration_test/folders_test.dart: 10·S-178 — past the ceiling of open folders, opening one more is refused with the ceiling [E]',
    '01:35 +2 -4: /m/integration_test/folders_test.dart: 10·S-178 — past the ceiling of open folders, opening one more is refused with the ceiling [E]',
    '01:40 +2 -5: /m/integration_test/chat_layout_test.dart: 10·S-120 — the cycle in 200 % type [E]',
    '01:41 +2 -6: /m/integration_test/chat_layout_test.dart: 10·S-115…S-120 — S-117: the turn inline [E]',
    '  Null check operator used on a null value',
    '══╡ EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK ╞════════════════',
    'The following assertion was thrown running a test:',
    'setState() or markNeedsBuild() called during build.',
    '#0      Element.markNeedsBuild',
    '01:36 +2 -5: /m/integration_test/connection_test.dart: 10·S-111 — another address [E]',
    '  Test failed. See exception logs above.',
    '  The test description was: 10·S-111 — another address',
    '01:41 +2 -6: Some tests failed.',
  ].join('\n');

  it('names each failed test once, with the first line of what failed it', () => {
    expect(suiteFailures(output)).toEqual([
      {
        test: '10·S-178 — past the ceiling of open folders, opening one more is refused with the ceiling',
        reason: 'Expected: (int, String):<(409, OPEN_FOLDERS_LIMIT_REACHED)>',
      },
      { test: '10·S-120 — the cycle in 200 % type', reason: 'see the output above' },
      { test: '10·S-115…S-120 — S-117: the turn inline', reason: 'see the output above' },
      {
        test: '10·S-111 — another address',
        reason: 'setState() or markNeedsBuild() called during build.',
      },
    ]);
  });

  it('a block that only says what was thrown gives no reason, and the test is still named', () => {
    const thrownOnly = [
      '══╡ EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK ╞═══',
      'The following assertion was thrown running a test:',
      '',
      'The test description was:',
      '  10·S-01 — a',
      '00:01 +0 -1: /m/integration_test/a_test.dart: 10·S-01 — a [E]',
    ].join('\n');

    expect(suiteFailures(thrownOnly)).toEqual([{ test: '10·S-01 — a', reason: '' }]);
  });

  it('finds nothing in a green run', () => {
    expect(suiteFailures('00:20 +3: All tests passed!')).toEqual([]);
  });
});
