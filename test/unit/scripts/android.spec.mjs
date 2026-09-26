import { describe, expect, it } from 'vitest';

import {
  EMULATOR_API_LEVEL,
  apiLevelProblem,
  suiteProblem,
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
