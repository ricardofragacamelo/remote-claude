import { Module } from '@nestjs/common';

import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import { DrizzleSessionOriginRepository } from '@adapter/outbound/persistence/session/drizzle-session-origin.repository';

/**
 * That **we** opened a conversation of Claude — `session_origins`, and nothing else.
 *
 * A module of its own for one reason: two modules need it and one of them needs the other.
 * `session` writes the provenance and, to continue a conversation, asks `transcript` about it;
 * `transcript` reads the provenance to label what it lists. With the repository inside `session`,
 * `transcript` would import `session` and `session` would import `transcript` — the cycle the
 * boundaries forbid (docs/architecture/backend/03-modules.md#fronteiras).
 *
 * It is still `session`'s: the port is declared in `application/session`, and `session` is the only
 * writer. This is wiring, not a new owner.
 */
@Module({
  providers: [{ provide: SESSION_ORIGIN_REPOSITORY, useClass: DrizzleSessionOriginRepository }],
  exports: [SESSION_ORIGIN_REPOSITORY],
})
export class SessionOriginModule {}
