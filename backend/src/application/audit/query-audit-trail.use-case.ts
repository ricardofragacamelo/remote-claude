import { AuditTrailForbiddenError } from '@domain/audit';
import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
} from './ports/audit-trail.reader';

/**
 * "What ran on my machine, and who let it?" — one page of the answer.
 *
 * Every page is scoped by who asks, always: nobody ever receives another person's entry. What this
 * use case adds is the answer to a request that **points** at somebody else's trail — a session
 * whose entries are another person's — and that answer is `403`, not an empty page that would read
 * as "nothing ran there" ([D-17](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * A session with no entry at all is an empty page: nothing says whose it is.
 */
export class QueryAuditTrailUseCase {
  constructor(private readonly trail: AuditTrailReader) {}

  /** @throws {AuditTrailForbiddenError} the session filtered by is somebody else's */
  async execute(request: AuditTrailPageRequest): Promise<AuditTrailPage> {
    if (
      request.sessionId !== null &&
      (await this.trail.ownershipOf(request.sessionId, request.userId)) === 'others'
    ) {
      throw new AuditTrailForbiddenError(request.sessionId.value);
    }

    return this.trail.page(request);
  }
}
