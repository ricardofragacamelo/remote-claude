import net from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { findFreePort, isPortFree } from '../../../scripts/lib/ports.mjs';

/** @type {net.Server[]} */
const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** @param {number} port */
function occupy(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    servers.push(server);
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      resolve(server);
    });
  });
}

describe('findFreePort', () => {
  it('answers a port that can actually be bound', async () => {
    const port = await findFreePort();

    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65_535);
    await expect(isPortFree(port)).resolves.toBe(true);
  });

  it('hands out distinct ports to callers asking at the same time', async () => {
    const ports = await Promise.all(Array.from({ length: 8 }, () => findFreePort()));

    expect(new Set(ports).size).toBe(ports.length);
  });

  it('never answers a port that is already taken', async () => {
    const taken = await findFreePort();
    await occupy(taken);

    const ports = await Promise.all(Array.from({ length: 8 }, () => findFreePort()));

    expect(ports).not.toContain(taken);
  });
});

describe('isPortFree', () => {
  it('reports a port nobody is listening on as free', async () => {
    await expect(isPortFree(await findFreePort())).resolves.toBe(true);
  });

  it('reports a port in use as taken — the case `doctor` warns about', async () => {
    const port = await findFreePort();
    await occupy(port);

    await expect(isPortFree(port)).resolves.toBe(false);
  });
});
