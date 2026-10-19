/// What drawing a trail needs to read from the outside world.
library;

import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';

/// The trail of one session's calls of one kind.
abstract interface class AuditRepository {
  /// One page of the trail of [kind] in [sessionId], newest first — the page after [cursor], or the
  /// first when it is `null`.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<AuditEntryPage> page({required String sessionId, required String kind, String? cursor});
}
