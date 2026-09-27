import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';

import { BearerAuthGuard, CurrentUser } from '@adapter/inbound/http/auth/bearer.guard';
import type { AuthenticateUseCase } from '@application/auth';
import { UnauthenticatedError, UserId } from '@domain/auth';

const caller = UserId.create('auth|42');

/** The use case, accepting one token and refusing every other. */
const authenticate = {
  execute: (token: string) =>
    token === 'good'
      ? Promise.resolve({ userId: caller, expiresAt: new Date() })
      : Promise.reject(new UnauthenticatedError('bad token')),
} as unknown as AuthenticateUseCase;

/** A context around one request, which the test can look at afterwards. */
function contextFor(authorization?: string): {
  context: ExecutionContext;
  request: Record<string | symbol, unknown>;
} {
  const request: Record<string | symbol, unknown> = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

/** What a parameter decorator resolves to, as Nest would call it. */
function resolve(decorator: () => ParameterDecorator, context: ExecutionContext): unknown {
  class Route {
    handle(value: unknown): unknown {
      return value;
    }
  }
  decorator()(Route.prototype, 'handle', 0);

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Route, 'handle') as Record<
    string,
    { factory: (data: unknown, context: ExecutionContext) => unknown }
  >;
  const [first] = Object.values(args);

  return first?.factory(undefined, context);
}

describe('BearerAuthGuard', () => {
  it('lets a verified credential through, and names the caller', async () => {
    const { context } = contextFor('Bearer good');

    await expect(new BearerAuthGuard(authenticate).canActivate(context)).resolves.toBe(true);
    expect(resolve(CurrentUser, context)).toBe(caller);
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic good'])(
    'refuses a request whose credential is %j',
    async (authorization) => {
      const { context } = contextFor(authorization);

      await expect(new BearerAuthGuard(authenticate).canActivate(context)).rejects.toThrow(
        UnauthenticatedError,
      );
    },
  );

  it('refuses a credential that does not verify', async () => {
    await expect(
      new BearerAuthGuard(authenticate).canActivate(contextFor('Bearer bad').context),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('refuses to name a caller on a route it did not guard', () => {
    expect(() => resolve(CurrentUser, contextFor().context)).toThrow(UnauthenticatedError);
  });
});
