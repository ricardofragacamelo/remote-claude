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
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;

      server.close(() => {
        if (port === 0) {
          reject(new Error('the operating system did not report the allocated port'));
          return;
        }

        resolve(port);
      });
    });

    server.listen({ port: 0, host, exclusive: true });
  });
}
