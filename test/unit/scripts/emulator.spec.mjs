import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  BOOT_TIMEOUT_MS,
  EMULATOR_AVD,
  EMULATOR_PORT,
  androidSdkRoot,
  attachedDevices,
  claimDevice,
  emulatorCommand,
  releaseDevice,
  waitForBoot,
  withSdkOnPath,
} from '../../../scripts/lib/emulator.mjs';

/**
 * @param {Partial<import('../../../scripts/lib/exec.mjs').RunResult>} result
 * @returns {import('../../../scripts/lib/exec.mjs').RunResult}
 */
function ran(result) {
  return { found: true, code: 0, stdout: '', stderr: '', ...result };
}

/**
 * An emulator process that has not exited — or has, once `exit` is called.
 *
 * @returns {import('node:child_process').ChildProcess & { exit: (code: number) => void }}
 */
function emulatorProcess() {
  const child = /** @type {any} */ ({ pid: 4242, exitCode: null, signalCode: null });
  child.exit = (/** @type {number} */ code) => {
    child.exitCode = code;
  };
  return child;
}

/**
 * A clock that moves only when the wait sleeps, so a five-minute deadline takes no time at all.
 *
 * @returns {{ now: () => number, sleep: (ms: number) => Promise<void> }}
 */
function fakeClock() {
  let at = 0;
  return {
    now: () => at,
    sleep: (ms) => {
      at += ms;
      return Promise.resolve();
    },
  };
}

/**
 * Tools with `adb` answering from a script of replies, in order; the last one repeats.
 *
 * @param {Record<string, import('../../../scripts/lib/exec.mjs').RunResult[]>} replies keyed by
 *   the adb arguments joined with a space
 */
function toolsAnswering(replies) {
  const child = emulatorProcess();
  const calls = /** @type {string[]} */ ([]);

  return {
    child,
    calls,
    tools: {
      adb: vi.fn((/** @type {readonly string[]} */ args) => {
        const key = args.join(' ');
        calls.push(key);
        const queue = replies[key] ?? [ran({})];
        return queue.length > 1 ? /** @type {any} */ (queue.shift()) : queue[0];
      }),
      startEmulator: vi.fn(() => child),
      kill: vi.fn(() => Promise.resolve()),
      ...fakeClock(),
    },
  };
}

describe('androidSdkRoot', () => {
  it('takes ANDROID_HOME first, then ANDROID_SDK_ROOT', () => {
    expect(androidSdkRoot({ ANDROID_HOME: '/sdk', ANDROID_SDK_ROOT: '/old' }, '/h', 'linux')).toBe(
      '/sdk',
    );
    expect(androidSdkRoot({ ANDROID_SDK_ROOT: '/old' }, '/h', 'linux')).toBe('/old');
  });

  it('falls back to where the installer puts it, per platform', () => {
    expect(androidSdkRoot({}, '/h', 'linux')).toBe(path.join('/h', 'Android', 'Sdk'));
    expect(androidSdkRoot({}, '/h', 'darwin')).toBe(path.join('/h', 'Library', 'Android', 'sdk'));
    expect(androidSdkRoot({}, '/h', 'win32')).toBe(
      path.join('/h', 'AppData', 'Local', 'Android', 'Sdk'),
    );
  });

  it('reads an empty variable as not set', () => {
    expect(androidSdkRoot({ ANDROID_HOME: '' }, '/h', 'linux')).toBe(
      path.join('/h', 'Android', 'Sdk'),
    );
  });
});

describe('withSdkOnPath', () => {
  it('puts platform-tools and emulator ahead of what PATH had', () => {
    const env = withSdkOnPath({ PATH: '/usr/bin', HOME: '/h' }, '/sdk', ':');

    expect(env.PATH).toBe(
      `${path.join('/sdk', 'platform-tools')}:${path.join('/sdk', 'emulator')}:/usr/bin`,
    );
    expect(env.HOME).toBe('/h');
  });

  it('builds a PATH from nothing when there was none', () => {
    expect(withSdkOnPath({}, '/sdk', ':').PATH).toBe(
      `${path.join('/sdk', 'platform-tools')}:${path.join('/sdk', 'emulator')}`,
    );
  });

  it('does not change the environment it was given', () => {
    const env = { PATH: '/usr/bin' };
    withSdkOnPath(env, '/sdk');
    expect(env.PATH).toBe('/usr/bin');
  });
});

describe('attachedDevices', () => {
  it('reads every serial, whatever its state', () => {
    const output = [
      '* daemon not running; starting now at tcp:5037',
      '* daemon started successfully',
      'List of devices attached',
      'emulator-5554\tdevice',
      'R58M123ABC\toffline',
      '',
    ].join('\n');

    expect(attachedDevices(output)).toEqual(['emulator-5554', 'R58M123ABC']);
  });

  it('answers nothing when nothing is attached', () => {
    expect(attachedDevices('List of devices attached\n\n')).toEqual([]);
  });

  it('copes with Windows line endings', () => {
    expect(attachedDevices('List of devices attached\r\nemulator-5556\tdevice\r\n')).toEqual([
      'emulator-5556',
    ]);
  });
});

describe('emulatorCommand', () => {
  it('starts the AVD headless, on the given port, without saving a snapshot', () => {
    const { command, args } = emulatorCommand({ avd: EMULATOR_AVD, port: 5554, fenced: false });

    expect(command).toBe('emulator');
    expect(args.slice(0, 4)).toEqual(['-avd', 'remote_claude_api35', '-port', '5554']);
    expect(args).toEqual(expect.arrayContaining(['-no-window', '-no-snapshot-save', '-no-audio']));
  });

  it('opens a window when somebody is there to use it, and changes nothing else', () => {
    const headless = emulatorCommand({ avd: EMULATOR_AVD, port: 5554, fenced: false });
    const windowed = emulatorCommand({
      avd: EMULATOR_AVD,
      port: 5554,
      fenced: false,
      window: true,
    });

    expect(windowed.args).not.toContain('-no-window');
    expect(windowed.args).toEqual(headless.args.filter((flag) => flag !== '-no-window'));
  });

  it('stays headless when the window is explicitly declined', () => {
    const { args } = emulatorCommand({
      avd: EMULATOR_AVD,
      port: 5554,
      fenced: false,
      window: false,
    });

    expect(args).toContain('-no-window');
  });

  it('runs inside a cgroup with a hard memory ceiling when systemd-run is there', () => {
    const { command, args } = emulatorCommand({ avd: EMULATOR_AVD, port: 5556, fenced: true });

    expect(command).toBe('systemd-run');
    expect(args).toEqual(
      expect.arrayContaining(['--user', '--scope', '--unit=rc-emulator-5556', 'MemoryMax=7G']),
    );
    expect(args.slice(args.indexOf('emulator'))).toEqual([
      'emulator',
      ...emulatorCommand({ avd: EMULATOR_AVD, port: 5556, fenced: false }).args,
    ]);
  });
});

describe('claimDevice', () => {
  it('uses a device that is already attached, and does not start another', () => {
    const { tools } = toolsAnswering({
      devices: [ran({ stdout: 'List of devices attached\nemulator-5560\tdevice\n' })],
    });

    expect(claimDevice(tools)).toEqual({ device: { serial: 'emulator-5560', child: null } });
    expect(tools.startEmulator).not.toHaveBeenCalled();
  });

  it('starts the emulator when nothing is attached, on the fixed port', () => {
    const { tools, child } = toolsAnswering({
      devices: [ran({ stdout: 'List of devices attached\n' })],
    });

    expect(claimDevice(tools)).toEqual({
      device: { serial: `emulator-${String(EMULATOR_PORT)}`, child },
    });
    expect(tools.startEmulator).toHaveBeenCalledOnce();
  });

  it('addresses the emulator by the port it was asked for', () => {
    const { tools } = toolsAnswering({ devices: [ran({ stdout: '' })] });

    expect(claimDevice(tools, { port: 5570 })).toMatchObject({
      device: { serial: 'emulator-5570' },
    });
  });

  it('says adb is missing, pointing at ANDROID_HOME', () => {
    const { tools } = toolsAnswering({ devices: [ran({ found: false, code: 127 })] });

    expect(claimDevice(tools)).toEqual({
      problem: 'adb is not installed — set ANDROID_HOME to the Android SDK',
    });
  });

  it('passes on what adb said when it failed', () => {
    const { tools } = toolsAnswering({ devices: [ran({ code: 1, stderr: 'cannot bind 5037\n' })] });

    expect(claimDevice(tools)).toEqual({ problem: 'adb devices failed: cannot bind 5037' });
    expect(tools.startEmulator).not.toHaveBeenCalled();
  });
});

describe('waitForBoot', () => {
  const booted = '-s emulator-5554 shell getprop sys.boot_completed';

  it('resolves once the device says it finished booting', async () => {
    const { tools, child, calls } = toolsAnswering({
      [booted]: [
        ran({ code: 1, stderr: 'device offline' }),
        ran({ stdout: '\n' }),
        ran({ stdout: '1\n' }),
      ],
    });

    await waitForBoot({ serial: 'emulator-5554', child }, tools);

    expect(calls.filter((call) => call === booted)).toHaveLength(3);
  });

  it('stops waiting the moment the emulator dies, saying how', async () => {
    const { tools, child } = toolsAnswering({ [booted]: [ran({ code: 1 })] });
    child.exit(1);

    await expect(waitForBoot({ serial: 'emulator-5554', child }, tools)).rejects.toThrow(
      'the device emulator-5554 exited with code 1 before it was ready',
    );
  });

  it('gives up at the deadline', async () => {
    const { tools, child } = toolsAnswering({ [booted]: [ran({ stdout: '0' })] });

    await expect(
      waitForBoot({ serial: 'emulator-5554', child }, tools, { timeoutMs: 10_000 }),
    ).rejects.toThrow('did not answer within 10000ms');
  });

  it('waits for a device it did not start too, which has no process to watch', async () => {
    const { tools } = toolsAnswering({
      '-s R58M shell getprop sys.boot_completed': [ran({ stdout: '1' })],
    });

    await expect(waitForBoot({ serial: 'R58M', child: null }, tools)).resolves.toBeUndefined();
  });

  it('gives a cold boot five minutes', () => {
    expect(BOOT_TIMEOUT_MS).toBe(300_000);
  });

  it('runs on the real clock when none is handed in', async () => {
    const { tools } = toolsAnswering({
      '-s R58M shell getprop sys.boot_completed': [ran({ stdout: '1' })],
    });
    const realTime = { adb: tools.adb, startEmulator: tools.startEmulator, kill: tools.kill };

    await expect(waitForBoot({ serial: 'R58M', child: null }, realTime)).resolves.toBeUndefined();
  });
});

describe('releaseDevice', () => {
  it('leaves a device it did not start alone', async () => {
    const { tools } = toolsAnswering({});

    await expect(releaseDevice({ serial: 'R58M', child: null }, tools)).resolves.toBe('kept');
    expect(tools.adb).not.toHaveBeenCalled();
    expect(tools.kill).not.toHaveBeenCalled();
  });

  it('asks the emulator to shut itself down, and waits for it', async () => {
    const { tools, child, calls } = toolsAnswering({});
    let polls = 0;
    const sleep = tools.sleep;
    tools.sleep = (ms) => {
      polls += 1;
      if (polls === 2) {
        child.exit(0);
      }
      return sleep(ms);
    };

    await expect(releaseDevice({ serial: 'emulator-5554', child }, tools)).resolves.toBe('stopped');
    expect(calls).toEqual(['-s emulator-5554 emu kill']);
    expect(tools.kill).not.toHaveBeenCalled();
  });

  it('kills the process group when the emulator ignores its own shutdown', async () => {
    const { tools, child } = toolsAnswering({});

    await expect(
      releaseDevice({ serial: 'emulator-5554', child }, tools, { timeoutMs: 5_000 }),
    ).resolves.toBe('killed');
    expect(tools.kill).toHaveBeenCalledWith(child);
  });

  it('counts an emulator ended by a signal as stopped', async () => {
    const { tools, child } = toolsAnswering({});
    /** @type {any} */ (child).signalCode = 'SIGTERM';

    await expect(releaseDevice({ serial: 'emulator-5554', child }, tools)).resolves.toBe('stopped');
  });

  it('runs on the real clock when none is handed in', async () => {
    const { tools, child } = toolsAnswering({});
    child.exit(0);
    const realTime = { adb: tools.adb, startEmulator: tools.startEmulator, kill: tools.kill };

    await expect(releaseDevice({ serial: 'emulator-5554', child }, realTime)).resolves.toBe(
      'stopped',
    );
  });
});
