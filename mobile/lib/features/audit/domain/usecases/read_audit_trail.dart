/// Reading the trail of a session and a kind of call. One use case, one thing it does.
library;

import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';

/// What ran, and who let it — one page at a time.
class ReadAuditTrail {
  const ReadAuditTrail(this._trail);

  final AuditRepository _trail;

  Future<AuditEntryPage> call({required String sessionId, required String kind, String? cursor}) =>
      _trail.page(sessionId: sessionId, kind: kind, cursor: cursor);
}
