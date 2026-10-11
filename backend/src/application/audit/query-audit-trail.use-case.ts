import type { ToolClassifiers } from '@application/engine';
import { AuditTrailForbiddenError, disclosedInput } from '@domain/audit';
import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  AuditTrailRecord,
} from './ports/audit-trail.reader';

/** An entry of the trail with the input it may show (B-16), and its kind. */
export interface DisclosedAuditRecord extends AuditTrailRecord {
  /** The input as the query discloses it — a `file.read` without the file. */
  readonly disclosed: Record<string, unknown>;

  /** The canonical kind of the call: the one the trail kept, or the classifier's for an old entry. */
  readonly kind: string;
}

/** A page of the trail, each entry with what it may show. */
export interface DisclosedAuditPage extends Omit<AuditTrailPage, 'records'> {
  readonly records: readonly DisclosedAuditRecord[];
}

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
  constructor(
    private readonly trail: AuditTrailReader,
    private readonly classifiers: ToolClassifiers,
  ) {}

  /** @throws {AuditTrailForbiddenError} the session filtered by is somebody else's */
  async execute(request: AuditTrailPageRequest): Promise<DisclosedAuditPage> {
    if (
      request.sessionId !== null &&
      (await this.trail.ownershipOf(request.sessionId, request.userId)) === 'others'
    ) {
      throw new AuditTrailForbiddenError(request.sessionId.value);
    }

    const page = await this.trail.page(request);

    return { ...page, records: page.records.map((record) => this.disclosed(record)) };
  }

  /**
   * [record] with the input it may show, and its kind. The trail keeps the engine's name and input,
   * and the kind beside them since `0023`; what the call disclosed is read from them by the engine's
   * classifier — the default engine's, as the trail does not keep the engine (plan 28, D-31, B-33).
   */
  private disclosed(record: AuditTrailRecord): DisclosedAuditRecord {
    const input = record.entry.input.value;
    const tool = this.classifiers.classify(null, record.entry.toolName, input);

    return {
      ...record,
      disclosed: disclosedInput(tool, input),
      kind: record.entry.toolKind ?? tool.kind,
    };
  }
}
