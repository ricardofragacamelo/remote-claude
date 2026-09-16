import type { DatabaseProbe } from './ports/database-probe.port';

/** What `GET /health` reports. */
export interface HealthReport {
  readonly status: 'up' | 'down';
  readonly database: 'up' | 'down';
}

/**
 * The one endpoint with no authentication: it is what `waitForHttp` polls while the stack comes
 * up, and a health check behind a login cannot do that job.
 */
export class CheckHealthUseCase {
  constructor(private readonly database: DatabaseProbe) {}

  async execute(): Promise<HealthReport> {
    const reachable = await this.database.isReachable();

    return { status: reachable ? 'up' : 'down', database: reachable ? 'up' : 'down' };
  }
}
