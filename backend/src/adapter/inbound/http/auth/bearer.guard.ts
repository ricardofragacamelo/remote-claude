import { createParamDecorator, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticateUseCase } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';
import type { UserId } from '@domain/auth';

/** Where the guard leaves who it found, for the parameter decorator to pick up. */
const CALLER = Symbol('caller');

/** A request the guard has already been through. */
interface AuthenticatedRequest extends Request {
  [CALLER]?: UserId;
}

/**
 * `Authorization: Bearer <access token>`, validated against the provider.
 *
 * The backend is a Resource Server and nothing else: it checks a token somebody else issued, and
 * it never issues one. The guard is the HTTP twin of the WebSocket handshake — same use case,
 * same failure, so a route and a socket can never disagree about who the caller is.
 *
 * It throws `UnauthenticatedError`, which the one exception filter turns into `401`. It never says
 * **which** validation failed: that detail goes to the log, not to whoever is probing.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(@Inject(AuthenticateUseCase) private readonly authenticate: AuthenticateUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
      throw new UnauthenticatedError('no bearer credential on the request');
    }

    request[CALLER] = (await this.authenticate.execute(token)).userId;

    return true;
  }
}

/**
 * The caller, as the guard established them.
 *
 * A controller never reads the header itself. If it did, a route could forget to, and a route that
 * forgets to authenticate looks exactly like a route that does.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const caller = context.switchToHttp().getRequest<AuthenticatedRequest>()[CALLER];

  if (caller === undefined) {
    // Reachable only by putting the decorator on a route without the guard — a wiring mistake,
    // and one that would otherwise hand the use case an identity nobody checked.
    throw new UnauthenticatedError('the route resolves a caller without guarding for one');
  }

  return caller;
});
