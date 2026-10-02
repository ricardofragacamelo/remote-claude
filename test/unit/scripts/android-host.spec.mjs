import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GRADLE_WRAPPER,
  claimReported,
  deviceTools,
  giveDeviceBack,
  realHost,
  reversePorts,
  reversedPorts,
  startAdbServer,
  stopGradleDaemons,
  unreversePorts,
} from '../../../scripts/lib/android-host.mjs';
import { EMULATOR_AVD } from '../../../scripts/lib/emulator.mjs';
import { repoRoot } from '../../../scripts/lib/paths.mjs';

/**
 * The real tools behind a run's device, with the host handed in: every branch of "take back what
 * you started, leave what you found" is exercised without an SDK, an emulator or a Gradle build.
 */

/**
 * @param {Partial<import('../../../scripts/lib/exec.mjs').RunResult>} result
 * @returns {import('../../../scripts/lib/exec.mjs').RunResult}
 */
function ran(result = {}) {
  return { found: true, code: 0, stdout: '', stderr: '', ...result };
}

/**
 * A host whose every call is recorded, answering `run` from a function of the arguments.
 *
 * @param {{ run?: (command: string, args: readonly string[]) => import('../../../scripts/lib/exec.mjs').RunResult,
 *           systemdRun?: boolean, platform?: NodeJS.Platform, exists?: boolean }} [options]
 */
function fakeHost(options = {}) {
  const child = /** @type {any} */ ({ pid: 77, exitCode: null, signalCode: null });

  return {
    child,
    host: {
      run: vi.fn(options.run ?? (() => ran())),
      startProc: vi.fn(() => child),
      kill: vi.fn(() => Promise.resolve()),
      commandExists: vi.fn(() => options.systemdRun ?? false),
      exists: vi.fn(() => options.exists ?? true),
      platform: options.platform ?? 'linux',
      env: { PATH: '/usr/bin' },
    },
  };
}

/**
 * An `adb` answering from a table keyed by its arguments joined with a space.
 *
 * @param {Record<string, import('../../../scripts/lib/exec.mjs').RunResult>} replies
 */
function adbAnswering(replies) {
  return vi.fn((/** @type {readonly string[]} */ args) => replies[args.join(' ')] ?? ran());
}

/** @type {string[]} */
let printed = [];

beforeEach(() => {
  printed = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    printed.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('realHost', () => {
  it('is wired to this machine', () => {
    expect(realHost.platform).toBe(process.platform);
    expect(realHost.env).toBe(process.env);
    expect(realHost.exists(repoRoot)).toBe(true);
  });
});

describe('deviceTools', () => {
  it('calls the adb of the SDK, wherever PATH points, with a deadline', () => {
    const { host } = fakeHost();

    deviceTools('/sdk', { host }).adb(['devices']);

    expect(host.run).toHaveBeenCalledWith(path.join('/sdk', 'platform-tools', 'adb'), ['devices'], {
      timeoutMs: 30_000,
    });
  });

  it('starts the AVD headless by default, with the SDK on PATH and its output ignored', () => {
    const { host, child } = fakeHost();

    const started = deviceTools('/sdk', { host }).startEmulator();

    expect(started).toBe(child);
    const [command, args, spawnOptions] = /** @type {any[]} */ (host.startProc.mock.calls[0]);
    expect(command).toBe('emulator');
    expect(args).toEqual(expect.arrayContaining(['-avd', EMULATOR_AVD, '-no-window']));
    expect(spawnOptions).toMatchObject({ cwd: repoRoot, stdio: 'ignore' });
    expect(spawnOptions.env.PATH.startsWith(path.join('/sdk', 'platform-tools'))).toBe(true);
  });

  it('opens a window when asked', () => {
    const { host } = fakeHost();

    deviceTools('/sdk', { host, window: true }).startEmulator();

    const [, args] = /** @type {any[]} */ (host.startProc.mock.calls[0]);
    expect(args).not.toContain('-no-window');
  });

  it('fences the emulator in a cgroup on Linux with systemd-run', () => {
    const { host } = fakeHost({ systemdRun: true });

    deviceTools('/sdk', { host }).startEmulator();

    expect(/** @type {any[]} */ (host.startProc.mock.calls[0])[0]).toBe('systemd-run');
  });

  it('does not look for systemd-run off Linux', () => {
    const { host } = fakeHost({ systemdRun: true, platform: 'darwin' });

    deviceTools('/sdk', { host }).startEmulator();

    expect(host.commandExists).not.toHaveBeenCalled();
    expect(/** @type {any[]} */ (host.startProc.mock.calls[0])[0]).toBe('emulator');
  });

  it('kills through the host', async () => {
    const { host, child } = fakeHost();

    await deviceTools('/sdk', { host }).kill(child);

    expect(host.kill).toHaveBeenCalledWith(child);
  });

  it('runs on the real host when none is handed in', () => {
    // Never called here: building the tools touches nothing, which is the point of checking it.
    expect(typeof deviceTools('/no-such-sdk').adb).toBe('function');
  });
});

describe('startAdbServer', () => {
  it('owns a server it had to start', () => {
    const adb = adbAnswering({
      'start-server': ran({
        stderr: '* daemon not running; starting now\n* daemon started successfully\n',
      }),
    });

    expect(startAdbServer(adb)).toBe(true);
  });

  it('does not own a server that was already running', () => {
    expect(startAdbServer(adbAnswering({ 'start-server': ran() }))).toBe(false);
  });

  it('does not own anything when the start failed', () => {
    const adb = adbAnswering({
      'start-server': ran({ code: 1, stdout: 'daemon started successfully' }),
    });

    expect(startAdbServer(adb)).toBe(false);
  });
});

describe('reversedPorts', () => {
  it('reads the device-side port of each row, whatever the transport is called', () => {
    const output = [
      '(reverse) tcp:3000 tcp:3000',
      'UsbFfs tcp:8180 tcp:8180',
      'host-12 tcp:9 tcp:19',
    ].join('\n');

    expect(reversedPorts(output)).toEqual([3000, 8180, 9]);
  });

  it('answers nothing when nothing is forwarded', () => {
    expect(reversedPorts('')).toEqual([]);
  });

  it('copes with Windows line endings and skips rows that are not forwards', () => {
    expect(reversedPorts('host-1 tcp:3000 tcp:3000\r\nlocalabstract:x tcp:1\r\n')).toEqual([3000]);
  });
});

describe('reversePorts', () => {
  it('forwards each port to the same port of this machine, on that device', () => {
    const adb = adbAnswering({});

    expect(reversePorts(adb, 'emulator-5554', [3000, 8180])).toEqual({
      added: [3000, 8180],
      problem: null,
    });
    expect(adb).toHaveBeenCalledWith(['-s', 'emulator-5554', 'reverse', 'tcp:3000', 'tcp:3000']);
    expect(adb).toHaveBeenCalledWith(['-s', 'emulator-5554', 'reverse', 'tcp:8180', 'tcp:8180']);
  });

  it('leaves a forward that was already there alone, and does not count it as its own', () => {
    const adb = adbAnswering({
      '-s d reverse --list': ran({ stdout: 'host-1 tcp:3000 tcp:3000\n' }),
    });

    expect(reversePorts(adb, 'd', [3000, 8180])).toEqual({ added: [8180], problem: null });
    expect(adb).not.toHaveBeenCalledWith(['-s', 'd', 'reverse', 'tcp:3000', 'tcp:3000']);
  });

  it('is a no-op the second time — everything is already there', () => {
    const adb = adbAnswering({
      '-s d reverse --list': ran({
        stdout: 'host-1 tcp:3000 tcp:3000\nhost-1 tcp:8180 tcp:8180\n',
      }),
    });

    expect(reversePorts(adb, 'd', [3000, 8180])).toEqual({ added: [], problem: null });
  });

  it('forwards everything when the list itself fails', () => {
    const adb = adbAnswering({
      '-s d reverse --list': ran({ code: 1, stdout: 'tcp:3000 tcp:3000' }),
    });

    expect(reversePorts(adb, 'd', [3000]).added).toEqual([3000]);
  });

  it('stops at the first failure, keeping the ones it added for the teardown', () => {
    const adb = adbAnswering({
      '-s d reverse tcp:8180 tcp:8180': ran({ code: 1, stderr: 'error: device offline\n' }),
    });

    expect(reversePorts(adb, 'd', [3000, 8180, 9000])).toEqual({
      added: [3000],
      problem: 'adb reverse tcp:8180 failed: error: device offline',
    });
    expect(adb).not.toHaveBeenCalledWith(['-s', 'd', 'reverse', 'tcp:9000', 'tcp:9000']);
  });
});

describe('unreversePorts', () => {
  it('removes each forward the run added, and answers none left', () => {
    const adb = adbAnswering({});

    expect(unreversePorts(adb, 'd', [3000, 8180])).toEqual([]);
    expect(adb).toHaveBeenCalledWith(['-s', 'd', 'reverse', '--remove', 'tcp:3000']);
    expect(adb).toHaveBeenCalledWith(['-s', 'd', 'reverse', '--remove', 'tcp:8180']);
  });

  it('answers the ones it could not remove', () => {
    const adb = adbAnswering({ '-s d reverse --remove tcp:8180': ran({ code: 1 }) });

    expect(unreversePorts(adb, 'd', [3000, 8180])).toEqual([8180]);
  });

  it('touches nothing when the run added nothing', () => {
    const adb = adbAnswering({});

    expect(unreversePorts(adb, 'd', [])).toEqual([]);
    expect(adb).not.toHaveBeenCalled();
  });
});

describe('giveDeviceBack', () => {
  /** @returns {import('../../../scripts/lib/emulator.mjs').DeviceTools} */
  function tools() {
    return {
      adb: vi.fn(() => ran()),
      startEmulator: vi.fn(),
      kill: vi.fn(() => Promise.resolve()),
    };
  }

  it('leaves a device that was attached before, and says so', async () => {
    const used = tools();

    expect(await giveDeviceBack({ serial: 'R5CT', child: null }, used)).toBe('kept');
    expect(used.adb).not.toHaveBeenCalled();
    expect(printed.join('')).toContain('device left as it was');
  });

  it('takes an emulator of the run down, and says which', async () => {
    const child = /** @type {any} */ ({ exitCode: 0, signalCode: null });

    expect(await giveDeviceBack({ serial: 'emulator-5554', child }, tools())).toBe('stopped');
    expect(printed.join('')).toContain('emulator down');
    expect(printed.join('')).toContain('emulator-5554');
  });

  it('says so when the emulator had to be killed', async () => {
    const child = /** @type {any} */ ({ exitCode: null, signalCode: null });
    let at = 0;
    const used = {
      ...tools(),
      now: () => at,
      sleep: (/** @type {number} */ ms) => {
        at += ms;
        return Promise.resolve();
      },
    };

    expect(await giveDeviceBack({ serial: 'emulator-5554', child }, used)).toBe('killed');
    expect(used.kill).toHaveBeenCalledWith(child);
    expect(printed.join('')).toContain('it ignored emu kill');
  });
});

describe('stopGradleDaemons', () => {
  it('stops the daemons, in a process group of its own, and says so', () => {
    const { host } = fakeHost();

    expect(stopGradleDaemons({ host, wrapper: '/m/android/gradlew' })).toBe('stopped');
    expect(host.run).toHaveBeenCalledWith('/m/android/gradlew', ['--stop'], {
      cwd: '/m/android',
      timeoutMs: 60_000,
      ownProcessGroup: true,
    });
    expect(printed.join('')).toContain('Gradle daemons stopped');
  });

  it('does nothing when Flutter never wrote a wrapper — no build, no daemon', () => {
    const { host } = fakeHost({ exists: false });

    expect(stopGradleDaemons({ host })).toBe('absent');
    expect(host.run).not.toHaveBeenCalled();
    expect(printed).toEqual([]);
  });

  it('warns, with the exit code, when the stop did not exit cleanly', () => {
    const { host } = fakeHost({ run: () => ran({ code: 3 }) });

    expect(stopGradleDaemons({ host })).toBe('failed');
    expect(printed.join('')).toContain('exit 3');
  });

  it('looks for the wrapper Flutter writes under mobile/android by default', () => {
    const { host } = fakeHost({ exists: false });

    stopGradleDaemons({ host });

    expect(host.exists).toHaveBeenCalledWith(GRADLE_WRAPPER);
    expect(GRADLE_WRAPPER.startsWith(path.join(repoRoot, 'mobile', 'android'))).toBe(true);
  });

  it('runs on the real host when none is handed in', () => {
    expect(stopGradleDaemons({ wrapper: path.join(repoRoot, 'no-such-gradlew') })).toBe('absent');
  });
});

describe('claimReported', () => {
  const fate = { kept: 'it stays up', started: 'it goes down' };

  /**
   * @param {import('../../../scripts/lib/exec.mjs').RunResult} devices what `adb devices` answers
   */
  function toolsListing(devices) {
    const child = /** @type {any} */ ({ pid: 9, exitCode: null, signalCode: null });
    return {
      child,
      tools: {
        adb: vi.fn(() => devices),
        startEmulator: vi.fn(() => child),
        kill: vi.fn(() => Promise.resolve()),
      },
    };
  }

  it('uses the attached device, saying what becomes of it', () => {
    const { tools } = toolsListing(ran({ stdout: 'List of devices attached\nR5CT\tdevice\n' }));

    expect(claimReported(tools, '/sdk', fate)).toEqual({ serial: 'R5CT', child: null });
    expect(tools.startEmulator).not.toHaveBeenCalled();
    expect(printed.join('')).toContain('R5CT — it stays up');
  });

  it('starts the emulator when nothing is attached, saying it goes down', () => {
    const { tools, child } = toolsListing(ran({ stdout: 'List of devices attached\n' }));

    expect(claimReported(tools, '/sdk', fate)).toEqual({ serial: 'emulator-5554', child });
    expect(printed.join('')).toContain(EMULATOR_AVD);
    expect(printed.join('')).toContain('it goes down');
  });

  it('answers no device, saying where the SDK was looked for, when adb is missing', () => {
    const { tools } = toolsListing(ran({ found: false, code: 127 }));

    expect(claimReported(tools, '/sdk', fate)).toBeNull();
    expect(printed.join('')).toContain('adb is not installed');
    expect(printed.join('')).toContain('looked for the SDK in /sdk');
  });
});
