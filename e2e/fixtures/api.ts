import { environment } from './environment';
import type { AuthenticatedUser } from './auth';

/**
 * One call of the HTTP API, as the browser makes it — or as the app does, naming its installation.
 *
 * The installation header is the whole difference between the two ends at this door: it is what
 * the backend reads to tell a phone from a browser. One helper for every spec, so no suite speaks a
 * dialect of the API the others do not.
 */

/** Header the app puts on every request, naming the installation it is. */
const INSTALL_ID_HEADER = 'x-install-id';

/** How a call is made: the verb, whose installation — none for a browser — and the body. */
export interface CallOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly installId?: string;
  readonly body?: unknown;
}

export function callApi(
  user: AuthenticatedUser,
  path: string,
  options: CallOptions = {},
): Promise<Response> {
  return fetch(`${environment.backendUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${user.accessToken}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.installId === undefined ? {} : { [INSTALL_ID_HEADER]: options.installId }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}
