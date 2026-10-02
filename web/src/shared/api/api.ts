import { config } from '@/shared/config/env';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import { toAppError, toTransportError } from './errors';

/** How long a request may take before it is abandoned. Every external call has a deadline. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Requests are retried once, and never for a failure repeating them cannot fix. */
export const MAX_ATTEMPTS = 2;

/**
 * The deadline of a transfer — a download of a file or a zip, an upload. Its ceiling is hundreds of
 * megabytes (07 · D-16), which no fifteen seconds carry over a phone's network; it still has one.
 */
export const TRANSFER_TIMEOUT_MS = 30 * 60_000;

/** How the client gets a credential, and what it does when one has expired. */
export interface Credentials {
  /** The access token to send, or `null` while nobody is signed in. */
  accessToken(): string | null;

  /** Renews after a `401`. Answers the new token, or `null` when renewal failed. */
  renew(): Promise<string | null>;
}

/** Everything a caller may vary about one request. */
export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly locale?: string;
  readonly signal?: AbortSignal;

  /**
   * Headers of the request itself — the preconditions of a file's version (`If-Match`,
   * `If-None-Match`). Transport headers (credential, trace, language) are the client's and win.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Whether a `401` may be answered by renewing and trying again. Defaults to true.
   *
   * The sign-in calls set it to false, and they are the only ones that have to: renewal is itself
   * a request, so a `401` on `/auth/refresh` that triggered a renewal would wait on the very
   * promise it is part of — the screen then sits on its loading state for ever, with no error and
   * nothing in the log.
   */
  readonly renewable?: boolean;

  /** What the response may be — JSON unless a caller reads bytes. */
  readonly accept?: string;
}

/** What a read of bytes may name: the preconditions and the range, the signal, the language. */
export type BytesOptions = Pick<RequestOptions, 'headers' | 'locale' | 'signal'>;

/**
 * The bytes of a response — a file as it is on disk, a zip — and the headers that say what they are
 * (`ETag`, `Content-Range`, `Content-Type`, `Content-Disposition`).
 */
export interface BytesResponse {
  readonly status: number;
  readonly blob: Blob;
  header(name: string): string | null;
}

/** What an upload may name besides its form. */
export interface UploadOptions {
  readonly locale?: string;

  /** Aborts the upload — the person cancelled it. */
  readonly signal?: AbortSignal;

  /** Told as the body leaves: the bytes sent so far, of how many. */
  onProgress?(loaded: number, total: number): void;
}

/** What an upload answered: a `2xx` and its body — `207` is one, with a result per item. */
export interface UploadResponse<T> {
  readonly status: number;
  readonly body: T;
}

/** What one attempt of an upload received. */
interface FormReply {
  readonly status: number;
  readonly text: string;
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
    // An upload is the one request that reports its progress, and only XMLHttpRequest does that.
    private readonly xhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
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

  put<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * @throws {import('./errors').AppError} always — a failure never reaches a caller as a raw
   *   `Response` or a `TypeError`, because then every caller would have to know about both
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { response, traceId } = await this.exchange(path, options);

    // `304`: the version the caller named in `If-None-Match` is the current one — nothing to read.
    if (response.status === 304) {
      return undefined as T;
    }

    if (!response.ok) {
      throw toAppError(await readBody(response), traceId);
    }

    return response.status === 204 ? (undefined as T) : ((await readBody(response)) as T);
  }

  /**
   * Reads the bytes of a response — a file for a preview or a download, a page of it by `Range`, a
   * zip — with the credential in the `Authorization` header like every other request: never in the
   * URL, so a `<img src>` or a link never needs one (07 · D-16). `206` is an answer like `200`.
   *
   * @throws {import('./errors').AppError} as {@link request} does — `412`, `413`, `416` with the
   *   envelope's `code` and `params`
   */
  async bytes(path: string, options: BytesOptions = {}): Promise<BytesResponse> {
    const deadline = AbortSignal.timeout(TRANSFER_TIMEOUT_MS);
    const signal =
      options.signal === undefined ? deadline : AbortSignal.any([options.signal, deadline]);
    const { response, traceId } = await this.exchange(path, { ...options, accept: '*/*', signal });

    if (!response.ok) {
      throw toAppError(await readBody(response), traceId);
    }

    try {
      const blob = await response.blob();
      return { status: response.status, blob, header: (name) => response.headers.get(name) };
    } catch (error) {
      // The connection dropped in the middle of the body: what arrived is not the file.
      logger.warn({ op: 'http.response', url: path, traceId, err: String(error) }, 'body cut');
      throw toTransportError(traceId);
    }
  }

  /**
   * Sends a form — the files of an upload — and reports how much of it left (`onProgress`), which
   * `fetch` cannot. The same transport as every request: the credential in the header, the trace,
   * the language, one renewal on a `401`, both edges logged, the envelope as an `AppError`.
   *
   * @throws {import('./errors').AppError} the server's refusal; `NETWORK_UNREACHABLE` when the
   *   connection failed, timed out or was aborted by `signal`
   */
  async upload<T>(
    path: string,
    form: FormData,
    options: UploadOptions = {},
  ): Promise<UploadResponse<T>> {
    const traceId = newTraceId();
    const startedAt = Date.now();

    logger.debug({ op: 'http.request', method: 'POST', url: path, traceId }, 'http request');

    let reply = await this.sendForm(path, form, options, traceId);

    if (reply.status === 401 && (await this.credentials.renew()) !== null) {
      reply = await this.sendForm(path, form, options, traceId);
    }

    logger.debug(
      {
        op: 'http.response',
        method: 'POST',
        url: path,
        traceId,
        httpStatus: reply.status,
        durationMs: Date.now() - startedAt,
      },
      'http response',
    );

    const body = parseBody(reply.text);

    if (reply.status < 200 || reply.status >= 300) {
      throw toAppError(body, traceId);
    }

    return { status: reply.status, body: body as T };
  }

  /** One request and its answer, logged at both edges. */
  private async exchange(
    path: string,
    options: RequestOptions,
  ): Promise<{ response: Response; traceId: string }> {
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

    return { response, traceId };
  }

  /** The headers every request carries — the credential, the trace, the language. */
  private transportHeaders(traceId: string, locale: string | undefined): Record<string, string> {
    const token = this.credentials.accessToken();

    return {
      'x-trace-id': traceId,
      'accept-language': locale ?? 'en',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    };
  }

  /** One attempt of an upload, by XMLHttpRequest — the one way to hear the body leave. */
  private sendForm(
    path: string,
    form: FormData,
    options: UploadOptions,
    traceId: string,
  ): Promise<FormReply> {
    return new Promise((resolve, reject) => {
      const request = this.xhr();
      const failed = (why: string) => () => {
        logger.warn({ op: 'http.response', url: path, traceId, err: why }, 'http failed');
        reject(toTransportError(traceId));
      };

      request.open('POST', `${this.baseUrl}${path}`);
      request.withCredentials = true;
      request.timeout = TRANSFER_TIMEOUT_MS;

      for (const [name, value] of Object.entries({
        accept: 'application/json',
        ...this.transportHeaders(traceId, options.locale),
      })) {
        request.setRequestHeader(name, value);
      }

      request.upload.onprogress = (event) => {
        options.onProgress?.(event.loaded, event.total);
      };
      request.onload = () => {
        resolve({ status: request.status, text: request.responseText });
      };
      request.onerror = failed('error');
      request.ontimeout = failed('timeout');
      request.onabort = failed('aborted');

      if (options.signal?.aborted === true) {
        failed('aborted')();
        return;
      }

      options.signal?.addEventListener('abort', () => {
        request.abort();
      });
      request.send(form);
    });
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
    const headers: Record<string, string> = {
      ...options.headers,
      accept: options.accept ?? 'application/json',
      ...this.transportHeaders(traceId, options.locale),
    };

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
  return parseBody(await response.text());
}

/** A body's text as JSON — or nothing, for an empty one or one that is not JSON. */
function parseBody(text: string): unknown {
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
