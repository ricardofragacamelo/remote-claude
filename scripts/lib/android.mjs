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

/** Where the app's end-to-end suites live, relative to the Flutter module. */
export const INTEGRATION_DIR = 'integration_test';

/**
 * What `flutter test` is given: the whole directory, or only the suites [names] names.
 *
 * A suite is named the way a person says it — `folders`, `folders_test`, `folders_test.dart` or
 * `integration_test/folders_test.dart` are the same one — so working on one suite does not cost
 * the minutes of all of them. A name that matches no suite is refused, saying which exist: a run
 * limited to a typo would build the app and test nothing.
 *
 * @param {readonly string[]} names
 * @param {readonly string[]} available the `*_test.dart` file names of {@link INTEGRATION_DIR}
 * @returns {{ targets: string[], problem: null } | { targets: null, problem: string }}
 */
export function suiteTargets(names, available) {
  if (names.length === 0) {
    return { targets: [INTEGRATION_DIR], problem: null };
  }

  const files = names.map(
    (name) =>
      `${name
        .replace(new RegExp(`^(\\./)?${INTEGRATION_DIR}/`), '')
        .replace(/\.dart$/, '')
        .replace(/_test$/, '')}_test.dart`,
  );
  const unknown = files.filter((file) => !available.includes(file));

  if (unknown.length > 0) {
    return {
      targets: null,
      problem: `no suite ${unknown.join(', ')} in ${INTEGRATION_DIR}/ — there are ${[...available].sort().join(', ')}`,
    };
  }

  return { targets: files.map((file) => `${INTEGRATION_DIR}/${file}`), problem: null };
}

/**
 * The tests a `flutter test` run failed, each with the first words of what failed it.
 *
 * A device run prints thousands of lines — the backend's log among them when the runner relays it —
 * and the one thing a reader needs after a red run is which tests and why. Each failed test is the
 * line `flutter test` ends with ` [E]`; its reason is the exception block whose "test description"
 * starts that name: the line after "The following … was thrown", or the expectation that failed.
 *
 * @param {string} output everything the runner printed
 * @returns {{ test: string, reason: string }[]} in the order they failed, each test once
 */
export function suiteFailures(output) {
  const blocks = [
    ...output.matchAll(
      // Never across into the next block; the description on the line after, or on the same one.
      /══╡ EXCEPTION CAUGHT[^\n]*\n((?:(?!══╡ EXCEPTION)[\s\S])*?)\n\s*The test description was:[ \t]*\n?\s*([^\n]+)/g,
    ),
  ].map(([, body, description]) => ({
    description: String(description).trim(),
    reason:
      String(body)
        .split('\n')
        .map((each) => each.trim())
        .find((each) => each !== '' && !each.startsWith('The following ')) ?? '',
  }));

  /** @type {Map<string, string>} */
  const failed = new Map();
  for (const [, test] of output.matchAll(
    /^[\d:]+ \+\d+(?: ~\d+)? -\d+: (?:\S+\.dart: )?(.+) \[E\]$/gm,
  )) {
    const name = String(test).trim();
    if (!failed.has(name)) {
      const block = blocks.find((each) => name.startsWith(each.description));
      failed.set(name, block?.reason ?? 'see the output above');
    }
  }

  return [...failed].map(([test, reason]) => ({ test, reason }));
}
