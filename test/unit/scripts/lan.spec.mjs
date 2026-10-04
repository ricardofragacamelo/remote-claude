import { describe, expect, it } from 'vitest';

import {
  LAN_ADDRESS_VARIABLE,
  isPrivateIpv4,
  lanAddress,
  resolveLanAddress,
} from '../../../scripts/lib/lan.mjs';

/**
 * This machine on the local network: the address `pnpm dev` accepts the login through and
 * `pnpm mobile:install` builds the app with (plan 10, B-35).
 */

/**
 * @param {string} address
 * @param {Partial<import('node:os').NetworkInterfaceInfo>} [extra]
 * @returns {import('node:os').NetworkInterfaceInfo}
 */
const entry = (address, extra = {}) =>
  /** @type {import('node:os').NetworkInterfaceInfo} */ ({
    address,
    family: 'IPv4',
    internal: false,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: null,
    ...extra,
  });

describe('isPrivateIpv4', () => {
  it('S-122 · takes the edges of each private range, and nothing past them', () => {
    for (const inside of [
      '10.0.0.0',
      '10.255.255.255',
      '172.16.0.0',
      '172.31.255.255',
      '192.168.0.0',
      '192.168.255.255',
    ]) {
      expect(isPrivateIpv4(inside), inside).toBe(true);
    }

    for (const outside of [
      '9.255.255.255',
      '11.0.0.0',
      '172.15.255.255',
      '172.32.0.0',
      '192.167.255.255',
      '192.169.0.0',
      '203.0.113.10',
    ]) {
      expect(isPrivateIpv4(outside), outside).toBe(false);
    }
  });

  it('S-123 · refuses what is not an IPv4 address', () => {
    for (const wrong of [
      '10.0.0.256',
      '10.0.0',
      '10.0.0.1.5',
      '10.0.0.0x1',
      'nope',
      '',
      'fd00::1',
    ]) {
      expect(isPrivateIpv4(wrong), wrong).toBe(false);
    }
  });
});

describe('lanAddress', () => {
  it('S-127 · skips containers, bridges and VPNs, and picks the physical card, listed after them', () => {
    const address = lanAddress({
      lo: [entry('127.0.0.1', { internal: true })],
      docker0: [entry('172.17.0.1')],
      'br-c88f15c4937e': [entry('192.168.32.1')],
      veth12ab: [entry('172.18.0.5')],
      tun0: [entry('10.8.0.2')],
      wg0: [entry('10.9.0.2')],
      wlp0s20f3: [entry('fe80::1', { family: 'IPv6' }), entry('192.168.0.10')],
      eth1: [entry('10.0.0.5')],
    });

    expect(address).toBe('192.168.0.10');
  });

  it('skips an interface whose only IPv4 address is public', () => {
    expect(lanAddress({ eth0: [entry('203.0.113.10')], wlan0: [entry('10.0.0.5')] })).toBe(
      '10.0.0.5',
    );
  });

  it('S-128 · answers null with only loopback, only virtual interfaces, or none at all', () => {
    expect(lanAddress({ lo: [entry('127.0.0.1', { internal: true })], empty: undefined })).toBe(
      null,
    );
    expect(lanAddress({ docker0: [entry('172.17.0.1')], virbr0: [entry('192.168.122.1')] })).toBe(
      null,
    );
    expect(lanAddress({})).toBe(null);
  });

  it('reads the real interfaces when none are given', () => {
    const address = lanAddress();

    expect(address === null || isPrivateIpv4(address)).toBe(true);
  });
});

describe('resolveLanAddress', () => {
  const interfaces = { wlan0: [entry('192.168.0.10')] };

  it('S-127 · finds it on the network interface when the .env names none', () => {
    for (const env of [{}, { [LAN_ADDRESS_VARIABLE]: '' }, { [LAN_ADDRESS_VARIABLE]: '  ' }]) {
      expect(resolveLanAddress(env, interfaces)).toEqual({
        address: '192.168.0.10',
        source: 'network interface',
      });
    }
  });

  it('S-128 · answers no address, without a problem, when there is no network', () => {
    expect(resolveLanAddress({}, {})).toEqual({ address: null, source: 'network interface' });
  });

  it('S-129 · the .env wins over the network, trimmed', () => {
    expect(resolveLanAddress({ [LAN_ADDRESS_VARIABLE]: ' 10.0.0.7 ' }, interfaces)).toEqual({
      address: '10.0.0.7',
      source: LAN_ADDRESS_VARIABLE,
    });
  });

  it.each(['10.0.0', 'nope', '203.0.113.10', 'http://10.0.0.7'])(
    'S-129 · refuses %s, naming the variable and the ranges',
    (written) => {
      const resolved = resolveLanAddress({ [LAN_ADDRESS_VARIABLE]: written }, interfaces);

      expect(resolved).toEqual({ problem: expect.stringContaining(`RC_LAN_ADDRESS="${written}"`) });
      expect(resolved).toEqual({ problem: expect.stringContaining('192.168/16') });
    },
  );
});
