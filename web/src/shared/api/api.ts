import { config } from '@/shared/config/env';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import { toAppError, toTransportError } from './errors';

/** How long a request may take before it is abandoned. Every external call has a deadline. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Requests are retried once, and never for a failure repeating them cannot fix. */
export const MAX_ATTEMPTS = 2;

/** How the client gets a credential, and what it does when one has expired. */
export interface Credentials {
  /** The access token to send, or `null` while nobody is signed in. */
  accessToken(): string | null;

  /** Renews after a `401`. Answers the new token, or `null` when renewal failed. */
  renew(): Promise<string | null>;
}

/** Everything a caller may vary about one request. */
export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
  readonly locale?: string;
  readonly signal?: AbortSignal;

  /**
   * Whether a `401` may be answered by renewing and trying again. Defaults to true.
   *
   * The sign-in calls set it to false, and they are the only ones that have to: renewal is itself
   * a request, so a `401` on `/auth/refresh` that triggered a renewal would wait on the very
   * promise it is part of — the screen then sits on its loading state for ever, with no error and
   * nothing in the log.
   */
  readonly renewable?: boolean;
}

/** Anonymous access: no token, and nothing to renew. */
export const anonymous: Credentials = {
  accessToken: () => null,
  renew: () => Promise.resolve(null),
};

/**
 * The HTTP client. There is exactly one in the application.
 *
 * Its whole job is transport: the credential, the trace, the language, the timeout, the single
 * retry, the logging of both edges, and turning the backend's error envelope into an `AppError`.
 * It knows no endpoint — that is the service's job — and it holds no business rule.
 * See docs/architecture/web/01-architecture.md.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private credentials: Credentials = anonymous,
    // Wrapped, never `= fetch`. A bare reference stored on the instance is invoked as
    // `this.http(...)`, which makes the client the receiver — and a browser answers that with
    // "Illegal invocation" before a single byte leaves the machine. The arrow keeps the global as
    // the receiver, and keeps the lookup late enough for a test to stand in for it.
    private readonly http: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Swaps in the credential source once authentication is wired up. */
  useCredentials(credentials: Credentials): void {
    this.credentials = credentials;
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * @throws {import('./errors').AppError} always — a failure never reaches a caller as a raw
   *   `Response` or a `TypeError`, because then every caller would have to know about both
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const traceId = newTraceId();
    const method = options.method ?? 'GET';
    const startedAt = Date.now();

    logger.debug({ op: 'http.request', method, url: path, traceId }, 'http request');

    const response = await this.attempt(path, options, traceId, 1);

    logger.debug(
      {
        op: 'http.response',
        method,
        url: path,
        traceId,
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
      },
      'http response',
    );

    if (!response.ok) {
      throw toAppError(await readBody(response), traceId);
    }

    return response.status === 204 ? (undefined as T) : ((await readBody(response)) as T);
  }

  /**
   * One attempt, and at most one more.
   *
   * A `401` is retried **once**, after renewing — a second attempt on a second `401` would be a
   * renewal loop. Every other `4xx` is returned as it is: repeating a `403` does not change it.
   * A request the caller marked non-renewable is never retried: see `RequestOptions.renewable`.
   */
  private async attempt(
    path: string,
    options: RequestOptions,
    traceId: string,
    attempt: number,
  ): Promise<Response> {
    const response = await this.send(path, options, traceId);

    if (response.status !== 401 || attempt >= MAX_ATTEMPTS || options.renewable === false) {
      return response;
    }

    const renewed = await this.credentials.renew();
    if (renewed === null) {
      return response;
    }

    return this.attempt(path, options, traceId, attempt + 1);
  }

  private async send(path: string, options: RequestOptions, traceId: string): Promise<Response> {
    const token = this.credentials.accessToken();
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-trace-id': traceId,
      'accept-language': options.locale ?? 'en',
    };

    if (token !== null) {
      headers['authorization'] = `Bearer ${token}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    try {
      return await this.http(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        credentials: 'include',
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      logger.warn({ op: 'http.response', url: path, traceId, err: String(error) }, 'http failed');
      throw toTransportError(traceId);
    }
  }
}

/** The body, whatever shape it turned out to have. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    // A proxy's HTML error page is not JSON, and the caller still deserves an `AppError`.
    return undefined;
  }
}

/** The one client. A second one in the project means something escaped the chain. */
export const api = new ApiClient(config.apiUrl);
