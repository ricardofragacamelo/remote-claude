/// The audit repository: the trail, as the entities the trail page draws.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/data/datasources/audit_api_data_source.dart';
import 'package:remote_claude/features/audit/data/mappers/audit_entry_mapper.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';

/// [AuditRepository] over the backend's HTTP API.
class AuditRepositoryImpl implements AuditRepository {
  const AuditRepositoryImpl(this._api);

  final AuditApiDataSource _api;

  @override
  Future<AuditEntryPage> page({
    required String sessionId,
    required String kind,
    String? cursor,
  }) async =>
      auditEntryPageFrom(await _api.page(sessionId: sessionId, kind: kind, cursor: cursor)) ??
      (throw const UnexpectedFailure(traceId: unknownTraceId));
}
