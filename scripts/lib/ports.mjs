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
