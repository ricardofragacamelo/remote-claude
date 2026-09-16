import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CheckHealthUseCase } from '@application/health';
import type { HealthReport } from '@application/health';

/** How long a caller should wait before asking again while the backend is unwell. */
const RETRY_AFTER_SECONDS = '5';

/**
 * `GET /health` — the only route with no authentication.
 *
 * It is what the startup scripts poll while the stack comes up, and a health check behind a login
 * cannot do that job.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(CheckHealthUseCase) private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  async read(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.checkHealth.execute();

    if (report.status === 'down') {
      // `503` and never `200` with the bad news in the body: a load balancer reads the status
      // line, not the JSON. `Retry-After` is mandatory — without it the caller hammers.
      response.status(503).setHeader('Retry-After', RETRY_AFTER_SECONDS);
    }

    return report;
  }
}
