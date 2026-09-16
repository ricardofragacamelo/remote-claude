/**
 * TCP port probing.
 *
 * `doctor` uses it to tell, before anything starts, that a fixed port of the development stack
 * is already taken — an error that is otherwise debugged as if it were a code error.
 */

import net from 'node:net';

/**
 * Whether a port can be bound on the given host.
 *
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<boolean>}
 */
export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen({ port, host, exclusive: true });
  });
}

/**
 * A port the operating system says is free right now.
 *
 * Binding port 0 makes the kernel pick one, which is the only allocation that does not race
 * against every other process on the machine. There is still a window between closing this
 * socket and the caller binding the port — unavoidable, and small enough that `run-e2e-local`
 * relies on it rather than on a fixed range that two parallel CI jobs would collide on.
 *
 * @param {string} [host]
 * @returns {Promise<number>}
 */
export function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);

    server.once('listening', () => {
      // Inside `listening` the address is always an AddressInfo — a string address only happens
      // for a Unix socket, and this server was bound to a host and port. Checking for it anyway
      // would add a branch no test could ever reach.
      const { port } = /** @type {net.AddressInfo} */ (server.address());

      server.close(() => resolve(port));
    });

    server.listen({ port: 0, host, exclusive: true });
  });
}
