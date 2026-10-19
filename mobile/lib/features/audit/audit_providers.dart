/// Wiring of the audit feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/features/audit/data/datasources/audit_api_data_source.dart';
import 'package:remote_claude/features/audit/data/repositories/audit_repository_impl.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';
import 'package:remote_claude/features/audit/domain/usecases/read_audit_trail.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'audit_providers.g.dart';

/// The trail's edge of the backend.
@Riverpod(keepAlive: true)
AuditApiDataSource auditApiDataSource(Ref ref) =>
    HttpAuditApiDataSource(ref.watch(apiClientProvider));

/// The trail repository.
@Riverpod(keepAlive: true)
AuditRepository auditRepository(Ref ref) =>
    AuditRepositoryImpl(ref.watch(auditApiDataSourceProvider));

/// Reads the trail of a session and a kind of call.
@Riverpod(keepAlive: true)
ReadAuditTrail readAuditTrail(Ref ref) => ReadAuditTrail(ref.watch(auditRepositoryProvider));
