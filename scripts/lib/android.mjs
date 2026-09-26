/**
 * What the Android end-to-end suite needs from the device it runs on.
 *
 * Pure functions, so the rule is tested without a device: the script reads what `adb` answers and
 * hands it here.
 */

/**
 * The API level the suite runs on, and the only one.
 *
 * Fixed because the result has to be comparable between two machines: the API level changes the
 * notification permission, biometrics and deep links, which is exactly what the suite exercises.
 * 33 is the floor for the notification permission dialog to exist at all — on an older image that
 * scenario never appears and the suite passes without proving anything. One image, not two: the
 * suite is already the most expensive in the repository
 * (docs/plans/02-mobile-approval/decisions.md#d-09--o-emulador-reprodutível).
 */
export const EMULATOR_API_LEVEL = 35;

/**
 * Why the device that answered cannot run the suite, or `null` when it can.
 *
 * @param {string} reported what `adb shell getprop ro.build.version.sdk` printed
 * @param {number} [expected]
 * @returns {string | null}
 */
export function apiLevelProblem(reported, expected = EMULATOR_API_LEVEL) {
  const level = Number.parseInt(reported.trim(), 10);

  if (Number.isNaN(level)) {
    return `the device did not say which API level it runs (got "${reported.trim()}")`;
  }

  if (level !== expected) {
    return `the device runs API ${String(level)}, and the suite is fixed on API ${String(expected)}`;
  }

  return null;
}

/**
 * Why a device suite that exited 0 still did not prove anything, or `null` when it did.
 *
 * Measured on 2026-09-24: `flutter test integration_test` installed the app, printed nothing more
 * and exited 0 — no test had run. An exit code alone would have called that green. So the runner's
 * own report is read too: `flutter test` ends a good run with `+N: All tests passed!`, and `patrol`
 * reports `Successful: N`. Anything else — including N = 0 — is not a pass.
 *
 * @param {'flutter' | 'patrol'} runner
 * @param {string} output everything the runner printed
 * @returns {string | null}
 */
export function suiteProblem(runner, output) {
  const passed =
    runner === 'flutter'
      ? /\+(\d+): All tests passed!/.exec(output)
      : /Successful:\s*(\d+)/.exec(output);
  const count = passed === null ? 0 : Number(passed[1]);

  return count > 0 ? null : `the ${runner} run exited 0, and its report shows no test that passed`;
}
