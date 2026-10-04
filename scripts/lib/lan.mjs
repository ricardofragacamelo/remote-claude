/**
 * This machine's address on the local network: the one a phone on the same Wi-Fi reaches the stack
 * through, without a cable (plan 10, D-22 and D-23).
 *
 * Two scripts read it and have to agree on it — `pnpm dev`, which accepts the login of that origin,
 * and `pnpm mobile:install`, which builds the app with it — so the rule is written here once.
 */

import os from 'node:os';

/** The variable that names the address when the machine has more than one network (D-22). */
export const LAN_ADDRESS_VARIABLE = 'RC_LAN_ADDRESS';

/**
 * Interfaces that are not this machine's own network card: containers, bridges, virtual machines
 * and VPNs. Their addresses are private too, and a phone on the Wi-Fi reaches none of them.
 */
const VIRTUAL_INTERFACE =
  /^(docker|br-|veth|virbr|vboxnet|vmnet|tun|tap|wg|tailscale|zt|cni|flannel|lxc|lxd)/;

/** What the app accepts `http://` to, besides itself — in words, for the line that refuses (D-20). */
export const PRIVATE_RANGES = '10/8, 172.16/12, 192.168/16';

/**
 * Whether `address` is an IPv4 address of a private network: `10/8`, `172.16/12` or `192.168/16`.
 *
 * The same rule the app's `checkOrigin` applies before it talks `http://` to a host (D-20).
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isPrivateIpv4(address) {
  const parts = address.split('.');

  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false;
  }

  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }

  const [first, second] = /** @type {[number, number, number, number]} */ (octets);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/**
 * The first private IPv4 address of a physical interface of this machine, or `null` when there is
 * none — only loopback, only containers, or no network at all.
 *
 * The backend binds every interface, so a phone on the same network talks to the stack through
 * this address — `localhost` on the phone is the phone.
 *
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} [interfaces]
 * @returns {string | null}
 */
export function lanAddress(interfaces = os.networkInterfaces()) {
  for (const [name, entries] of Object.entries(interfaces)) {
    if (VIRTUAL_INTERFACE.test(name)) {
      continue;
    }

    const found = (entries ?? []).find(
      (entry) => entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address),
    );

    if (found !== undefined) {
      return found.address;
    }
  }

  return null;
}

/**
 * @typedef {{ address: string | null, source: string } | { problem: string }} LanResolution
 *   `source` says where the address came from, for the line the operator reads
 */

/**
 * The local-network address of this machine: the `.env`'s, when it names one, else the one found.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} [interfaces]
 * @returns {LanResolution}
 */
export function resolveLanAddress(env, interfaces) {
  const written = (env[LAN_ADDRESS_VARIABLE] ?? '').trim();

  if (written === '') {
    return { address: lanAddress(interfaces), source: 'network interface' };
  }

  if (!isPrivateIpv4(written)) {
    return {
      problem: `${LAN_ADDRESS_VARIABLE}="${written}" is not an IPv4 address of the private network (${PRIVATE_RANGES}) — the app refuses http:// to anything else`,
    };
  }

  return { address: written, source: LAN_ADDRESS_VARIABLE };
}
