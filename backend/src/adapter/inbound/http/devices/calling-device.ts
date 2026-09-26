import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Header the app puts on every request, naming the installation it is.
 *
 * A header rather than a body field because it is a property of the **caller**, not of what is
 * being asked: it has to be readable on a `GET` and on a `DELETE` too. A browser never sends it,
 * and that absence is what the approval rule reads.
 */
export const INSTALL_ID_HEADER = 'x-install-id';

/**
 * The installation a set of headers names, or `null`.
 *
 * A header can arrive twice — a proxy, or a client with a bug — and the first value wins. That is
 * a decision rather than an accident: the alternative is whatever the runtime happened to do,
 * which would differ between a development machine and whatever sits in front of the real one.
 *
 * An empty header is the same as no header. Something that meant "a device, but a nameless one"
 * would be a third case for every caller to handle, and there is nothing it could be.
 */
export function callingInstallId(headers: Request['headers']): string | null {
  const header = headers[INSTALL_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  return value === undefined || value === '' ? null : value;
}

/**
 * The installation the caller is using, or `null` for a browser.
 *
 * It is deliberately **not** authentication. It says which of this user's devices is asking, and
 * everything that matters hangs off the row it names — a client claiming an installation it is not
 * gains nothing it did not already have as that user, and claiming one at all is the only way to
 * be refused the approval endpoint.
 */
export const CallingDevice = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  callingInstallId(context.switchToHttp().getRequest<Request>().headers),
);
