import { FakeSocket } from './fake-socket';

/** Every socket the page opened while the fake was installed. */
export interface InstalledWebSocket {
  readonly created: FakeSocket[];
  readonly latest: FakeSocket;
}

/**
 * Replaces the platform `WebSocket` with one a test drives.
 *
 * The client under test creates its own socket — that is the behaviour worth testing — so the test
 * replaces the constructor rather than the client. Nothing inside `src/` is mocked.
 */
export function installFakeWebSocket(): InstalledWebSocket {
  const created: FakeSocket[] = [];

  class Constructed extends FakeSocket {
    constructor(url: string) {
      super(url);
      created.push(this);
    }
  }

  Object.defineProperty(globalThis, 'WebSocket', { value: Constructed, configurable: true });

  return {
    created,
    get latest(): FakeSocket {
      const socket = created.at(-1);

      if (socket === undefined) {
        throw new Error('the page has not opened a socket');
      }

      return socket;
    },
  };
}
