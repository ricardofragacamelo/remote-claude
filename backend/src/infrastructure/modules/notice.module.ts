import { Module } from '@nestjs/common';

import { NOTICE_STORE } from '@application/notice';
import { DrizzleNoticeStoreRepository } from '@adapter/outbound/persistence/notice/drizzle-notice-store.repository';

/**
 * Where a `session.notice` is kept outside any engine's own transcript (Plan 27, F7, D-15).
 *
 * A module of its own for the same reason as [SessionOriginModule]: `session` writes a notice as it
 * is emitted live, and `transcript` reads a conversation's notices back to merge into its history —
 * putting the port in either one would make the other import it, the cycle the boundaries forbid
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
@Module({
  providers: [{ provide: NOTICE_STORE, useClass: DrizzleNoticeStoreRepository }],
  exports: [NOTICE_STORE],
})
export class NoticeModule {}
