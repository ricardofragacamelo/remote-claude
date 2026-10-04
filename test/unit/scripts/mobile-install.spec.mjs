import { describe, expect, it } from 'vitest';

import {
  DEBUG_APK,
  buildAndInstall,
  flutterBuildArgs,
  installAddresses,
  installFailureHint,
  parseInstallArgs,
  pickDevice,
  usbDevices,
} from '../../../scripts/lib/mobile-install.mjs';

/**
 * What `pnpm mobile:install` builds the app with, and which phone it picks (plan 10, B-36).
 */

const LAN = { address: '192.168.0.10', source: 'network interface' };
const NO_LAN = { address: null, source: 'network interface' };
const NOTHING_RECORDED = { origin: null, file: '.run/public-origin' };

describe('parseInstallArgs', () => {
  it('reads nothing, --dry-run and --device, with or without the separator pnpm passes', () => {
    expect(parseInstallArgs([])).toEqual({ ok: true, dryRun: false, device: null });
    expect(parseInstallArgs(['--', '--dry-run'])).toEqual({ ok: true, dryRun: true, device: null });
    expect(parseInstallArgs(['--device', 'R58M', '--dry-run'])).toEqual({
      ok: true,
      dryRun: true,
      device: 'R58M',
    });
  });

  it.each([[['--release']], [['--device']], [['--device', '--dry-run']], [['extra']]])(
    'refuses %j, naming the argument',
    (argv) => {
      expect(parseInstallArgs(argv)).toEqual({
        ok: false,
        message: expect.stringContaining('unknown argument'),
      });
    },
  );
});

describe('installAddresses', () => {
  it('S-133 · the internal is the web dev server on the local network, said where from', () => {
    const addresses = installAddresses(
      { RC_WEB_PORT: '5999' },
      { lan: LAN, recorded: NOTHING_RECORDED },
    );

    expect(addresses).toMatchObject({
      internal: { url: 'http://192.168.0.10:5999', source: 'local network — network interface' },
    });
  });

  it('S-133 · RC_INTERNAL_URL in the .env wins over the network', () => {
    const addresses = installAddresses(
      { RC_INTERNAL_URL: ' https://home.example ' },
      { lan: LAN, recorded: NOTHING_RECORDED },
    );

    expect(addresses).toMatchObject({
      internal: { url: 'https://home.example', source: 'RC_INTERNAL_URL in .env' },
    });
  });

  it.each([
    [
      'RC_EXTERNAL_URL first',
      { RC_EXTERNAL_URL: 'https://a.example', RC_PUBLIC_URL: 'b.example' },
      'https://c.example',
      { url: 'https://a.example', source: 'RC_EXTERNAL_URL in .env' },
    ],
    [
      'RC_PUBLIC_URL, a bare host, next',
      { RC_EXTERNAL_URL: ' ', RC_PUBLIC_URL: 'b.example' },
      'https://c.example',
      { url: 'https://b.example', source: 'RC_PUBLIC_URL in .env' },
    ],
    [
      'what the last public run opened, last',
      {},
      'https://c.example',
      { url: 'https://c.example', source: 'last `pnpm dev:public` (.run/public-origin)' },
    ],
  ])('S-133 · the external: %s', (_what, env, recorded, expected) => {
    const addresses = installAddresses(env, {
      lan: LAN,
      recorded: { origin: recorded, file: '.run/public-origin' },
    });

    expect(addresses).toMatchObject({ external: expected });
  });

  it('S-133 · no external anywhere is a radio that is off, saying how to get one', () => {
    const addresses = installAddresses({}, { lan: LAN, recorded: NOTHING_RECORDED });

    expect(addresses).toMatchObject({
      external: { url: '', source: expect.stringContaining('pnpm dev:public') },
    });
  });

  it('S-134 · without a network address the internal is off, and the external carries the build', () => {
    const addresses = installAddresses(
      { RC_PUBLIC_URL: 'b.example' },
      { lan: NO_LAN, recorded: NOTHING_RECORDED },
    );

    expect(addresses).toMatchObject({
      internal: { url: '', source: 'no local network address' },
      external: { url: 'https://b.example' },
    });
  });

  it('S-134 · with neither address there is no build, and it says what to configure', () => {
    const addresses = installAddresses({}, { lan: NO_LAN, recorded: NOTHING_RECORDED });

    expect(addresses).toEqual({
      problems: [
        expect.stringContaining('no address to build the app with'),
        expect.stringContaining('RC_LAN_ADDRESS'),
      ],
    });
  });

  it.each([
    [
      { RC_EXTERNAL_URL: 'http://x.example' },
      'RC_EXTERNAL_URL in .env: "http://x.example" must be https://',
    ],
    [
      { RC_PUBLIC_URL: 'x.example/path' },
      'RC_PUBLIC_URL in .env: "x.example/path" must be an origin only',
    ],
  ])(
    'S-135 · refuses an external that is not an https origin, naming where it came from: %j',
    (env, said) => {
      expect(installAddresses(env, { lan: LAN, recorded: NOTHING_RECORDED })).toEqual({
        problems: [expect.stringContaining(said)],
      });
    },
  );

  it('refuses a web port that is not a port, rather than building against another', () => {
    expect(
      installAddresses({ RC_WEB_PORT: 'nope' }, { lan: LAN, recorded: NOTHING_RECORDED }),
    ).toEqual({ problems: [expect.stringContaining('RC_WEB_PORT="nope"')] });
  });
});

describe('usbDevices', () => {
  const output = [
    'List of devices attached',
    'R58M123ABC             device usb:1-1 product:beyond1 model:SM_G973F device:beyond1 transport_id:3',
    'emulator-5554          device product:sdk_gphone64 model:sdk_gphone64_x86_64 transport_id:1',
    '192.168.0.20:5555      device product:x model:Pixel_7 device:panther transport_id:4',
    '0A1B2C3D               unauthorized usb:1-2 transport_id:5',
    '',
  ].join('\n');

  it('S-136 · lists only the phones on USB, with their state and model', () => {
    expect(usbDevices(output)).toEqual([
      { serial: 'R58M123ABC', state: 'device', model: 'SM_G973F' },
      { serial: '0A1B2C3D', state: 'unauthorized', model: 'unknown model' },
    ]);
  });

  it('S-136 · answers nothing when adb lists nothing', () => {
    expect(usbDevices('List of devices attached\n\n')).toEqual([]);
    expect(usbDevices('')).toEqual([]);
  });
});

describe('pickDevice', () => {
  const ready = { serial: 'R58M', state: 'device', model: 'SM_G973F' };
  const other = { serial: 'P7', state: 'device', model: 'Pixel_7' };

  it('S-136 · picks the one phone that is ready', () => {
    expect(pickDevice([ready], null)).toEqual({ device: ready });
    expect(pickDevice([ready, { ...other, state: 'unauthorized' }], null)).toEqual({
      device: ready,
    });
  });

  it('S-136 · with no phone, says how to connect one', () => {
    expect(pickDevice([], null)).toEqual({
      problem: 'no phone on USB',
      hint: expect.stringContaining('USB debugging'),
    });
  });

  it('S-136 · with two ready phones, asks for --device and lists them; with it, picks that one', () => {
    expect(pickDevice([ready, other], null)).toEqual({
      problem: 'more than one phone on USB',
      hint: expect.stringContaining('R58M (SM_G973F, device), P7 (Pixel_7, device)'),
    });
    expect(pickDevice([ready, other], 'P7')).toEqual({ device: other });
  });

  it('S-136 · a --device that is not on USB is refused, with what is', () => {
    expect(pickDevice([ready], 'NOPE')).toEqual({
      problem: '--device NOPE is not on USB',
      hint: 'on USB: R58M (SM_G973F, device)',
    });
    expect(pickDevice([], 'NOPE')).toEqual({
      problem: '--device NOPE is not on USB',
      hint: 'no phone is on USB at all',
    });
  });

  it.each([
    ['unauthorized', 'Allow USB debugging'],
    ['offline', 'unplug'],
    ['no permissions', 'udev'],
    ['recovery', '`adb devices -l` says'],
  ])('S-136 · a phone that is %s is refused with what to do', (state, said) => {
    expect(pickDevice([{ ...ready, state }], null)).toEqual({
      problem: `R58M is ${state}`,
      hint: expect.stringContaining(said),
    });
  });
});

describe('flutterBuildArgs', () => {
  it('builds the debug APK with every define (D-21)', () => {
    expect(
      flutterBuildArgs({ RC_INTERNAL_URL: 'http://192.168.0.10:5173', RC_EXTERNAL_URL: '' }),
    ).toEqual([
      'build',
      'apk',
      '--debug',
      '--dart-define',
      'RC_INTERNAL_URL=http://192.168.0.10:5173',
      '--dart-define',
      'RC_EXTERNAL_URL=',
    ]);
    expect(DEBUG_APK).toBe('build/app/outputs/flutter-apk/app-debug.apk');
  });
});

describe('installFailureHint', () => {
  it.each([
    [
      'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]',
      'adb -s R58M uninstall',
    ],
    ['Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]', 'Install via USB'],
    ['Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]', 'out of space'],
  ])('S-139 · says what to do about %s', (output, said) => {
    expect(installFailureHint(output, 'R58M')).toContain(said);
  });

  it('leaves anything else to the output itself', () => {
    expect(installFailureHint('adb: device offline', 'R58M')).toBe(null);
  });
});

describe('buildAndInstall', () => {
  /** @param {number} code @param {string} [stdout] @param {string} [stderr] */
  const result = (code, stdout = '', stderr = '') => ({ found: true, code, stdout, stderr });
  const DEFINES = { RC_INTERNAL_URL: 'http://192.168.0.10:5173' };

  /**
   * Tools that answer with [built] and [installed], and remember every call.
   *
   * @param {ReturnType<typeof result>} built
   * @param {ReturnType<typeof result>} installed
   */
  function tools(built, installed) {
    /** @type {string[][]} */
    const calls = [];
    return {
      calls,
      flutter: (/** @type {string[]} */ args) => {
        calls.push(['flutter', ...args]);
        return built;
      },
      adb: (/** @type {string[]} */ args) => {
        calls.push(['adb', ...args]);
        return installed;
      },
    };
  }

  it('S-138 · builds the debug APK with the defines, then installs it replacing what is there', () => {
    const host = tools(result(0), result(0, 'Performing Streamed Install\nSuccess\n'));

    expect(buildAndInstall(host, 'R58M', DEFINES, '/m/app-debug.apk')).toEqual({ installed: true });
    expect(host.calls).toEqual([
      ['flutter', ...flutterBuildArgs(DEFINES)],
      ['adb', '-s', 'R58M', 'install', '-r', '/m/app-debug.apk'],
    ]);
  });

  it('S-138 · run again, it builds and installs again, the same way', () => {
    const host = tools(result(0), result(0, 'Success'));

    buildAndInstall(host, 'R58M', DEFINES, '/m/app-debug.apk');
    buildAndInstall(host, 'R58M', DEFINES, '/m/app-debug.apk');

    expect(host.calls.slice(2)).toEqual(host.calls.slice(0, 2));
  });

  it('S-139 · a failed build installs nothing', () => {
    const host = tools(result(1), result(0));

    expect(buildAndInstall(host, 'R58M', DEFINES, '/m/app-debug.apk')).toEqual({
      problem: 'the build failed',
      detail: 'exit 1 — the output above says why',
      hint: null,
    });
    expect(host.calls).toHaveLength(1);
  });

  it('S-139 · a refused install says the last line adb printed, and what to do', () => {
    const host = tools(
      result(0),
      result(
        1,
        'Performing Streamed Install\n',
        'adb: failed to install /m/app-debug.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: x]',
      ),
    );

    expect(buildAndInstall(host, 'R58M', DEFINES, '/m/app-debug.apk')).toEqual({
      problem: 'adb install failed',
      detail: expect.stringContaining('INSTALL_FAILED_UPDATE_INCOMPATIBLE'),
      hint: expect.stringContaining('adb -s R58M uninstall com.remoteclaude.remote_claude'),
    });
  });
});
