/// Wiring of the permission feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/permission/data/datasources/device_lock_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_api_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_rule_api_data_source.dart';
import 'package:remote_claude/features/permission/data/repositories/permission_repository_impl.dart';
import 'package:remote_claude/features/permission/data/repositories/permission_rule_repository_impl.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';
import 'package:remote_claude/features/permission/domain/usecases/gate_approval.dart';
import 'package:remote_claude/features/permission/domain/usecases/list_rules.dart';
import 'package:remote_claude/features/permission/domain/usecases/revoke_rule.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'permission_providers.g.dart';

/// The permission endpoint of the backend.
@Riverpod(keepAlive: true)
PermissionApiDataSource permissionApiDataSource(Ref ref) =>
    HttpPermissionApiDataSource(ref.watch(apiClientProvider));

/// The permission repository.
@Riverpod(keepAlive: true)
PermissionRepository permissionRepository(Ref ref) => PermissionRepositoryImpl(
  client: ref.watch(wsClientProvider),
  api: ref.watch(permissionApiDataSourceProvider),
  traceIds: ref.watch(traceIdsProvider),
);

/// Watches the questions of a session.
@Riverpod(keepAlive: true)
WatchPermissions watchPermissions(Ref ref) =>
    WatchPermissions(ref.watch(permissionRepositoryProvider));

/// Asks the server where one request stands.
@Riverpod(keepAlive: true)
LookupPermission lookupPermission(Ref ref) =>
    LookupPermission(ref.watch(permissionRepositoryProvider));

/// The device's lock screen.
@Riverpod(keepAlive: true)
ApprovalLock approvalLock(Ref ref) => LocalAuthApprovalLock(logger: ref.watch(appLoggerProvider));

/// Whether approvals ask for the lock.
@Riverpod(keepAlive: true)
ApprovalPreferences approvalPreferences(Ref ref) =>
    SecureApprovalPreferences(ref.watch(credentialStoreProvider));

/// The gate in front of every yes.
@Riverpod(keepAlive: true)
GateApproval gateApproval(Ref ref) =>
    GateApproval(ref.watch(approvalLockProvider), ref.watch(approvalPreferencesProvider));

/// Reads and changes the lock preference.
@Riverpod(keepAlive: true)
ApprovalLockSetting approvalLockSetting(Ref ref) =>
    ApprovalLockSetting(ref.watch(approvalLockProvider), ref.watch(approvalPreferencesProvider));

/// The clock the countdowns read. A provider, so a test decides what time it is.
@Riverpod(keepAlive: true)
DateTime Function() permissionClock(Ref ref) => DateTime.now;

/// The rule endpoints of the backend.
@Riverpod(keepAlive: true)
PermissionRuleApiDataSource permissionRuleApiDataSource(Ref ref) =>
    HttpPermissionRuleApiDataSource(ref.watch(apiClientProvider));

/// The rule repository.
@Riverpod(keepAlive: true)
PermissionRuleRepository permissionRuleRepository(Ref ref) => PermissionRuleRepositoryImpl(
  api: ref.watch(permissionRuleApiDataSourceProvider),
  logger: ref.watch(appLoggerProvider),
  traceIds: ref.watch(traceIdsProvider),
);

/// Reads the rules of the signed-in user.
@Riverpod(keepAlive: true)
ListRules listRules(Ref ref) => ListRules(ref.watch(permissionRuleRepositoryProvider));

/// Takes a rule back.
@Riverpod(keepAlive: true)
RevokeRule revokeRule(Ref ref) => RevokeRule(ref.watch(permissionRuleRepositoryProvider));
