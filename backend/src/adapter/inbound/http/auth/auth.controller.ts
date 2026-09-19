import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { EstablishSessionUseCase, RenewSessionUseCase } from '@application/auth';
import type { EstablishedSession } from '@application/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { establishSessionSchema } from './auth.dto';
import type { EstablishSessionDto, SessionDto } from './auth.dto';
import { readRefreshCookie, writeRefreshCookie } from './refresh-cookie';

/**
 * The browser's half of OIDC that a browser cannot safely do alone.
 *
 * The backend is still a Resource Server: it never authenticates anybody and never mints a token.
 * What it does here is complete an exchange the provider owns, and put the rotating half of the
 * result somewhere a script cannot reach. See docs/architecture/shared/08-authentication.md.
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(EstablishSessionUseCase) private readonly establish: EstablishSessionUseCase,
    @Inject(RenewSessionUseCase) private readonly renew: RenewSessionUseCase,
  ) {}

  /** Completes the login the browser started, after it has validated its own `state`. */
  @Post('session')
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(establishSessionSchema)) body: EstablishSessionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    return this.answer(await this.establish.execute(body), response);
  }

  /** Rotates the credential. Renewal is proactive, so this is not an error path. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    return this.answer(await this.renew.execute(readRefreshCookie(request)), response);
  }

  /**
   * Drops the refresh token.
   *
   * Ending the session at the provider is the browser's next step, not ours: only it can follow
   * a redirect to `end_session_endpoint`.
   */
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    writeRefreshCookie(response, null);
  }

  private answer(session: EstablishedSession, response: Response): SessionDto {
    writeRefreshCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
      userId: session.userId.value,
    };
  }
}
