/// The rule repository: the wire, turned into the entity the rules screen works with.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_rule_api_data_source.dart';
import 'package:remote_claude/features/permission/data/mappers/permission_rule_mapper.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';

/// [PermissionRuleRepository] over the backend's HTTP API.
class PermissionRuleRepositoryImpl implements PermissionRuleRepository {
  const PermissionRuleRepositoryImpl({
    required this._api,
    required this._logger,
    required this._traceIds,
  });

  final PermissionRuleApiDataSource _api;
  final AppLogger _logger;
  final TraceIds _traceIds;

  @override
  Future<List<PermissionRule>> list() async {
    final List<PermissionRule>? rules = permissionRulesIn(await _api.list());

    // A body this build cannot read is not an empty list: "you granted nothing" would be a false
    // sentence about exactly what this screen exists to show.
    if (rules == null) {
      throw ServerFailure(
        code: 'INTERNAL_ERROR',
        messageKey: 'common.error.unexpected',
        traceId: _traceIds.next(),
      );
    }

    return rules;
  }

  @override
  Future<void> revoke(String ruleId) async {
    await _api.revoke(ruleId);

    // `info` and not only the `debug` of the HTTP edge: it is a change to what may run on the
    // user's machine without asking, the same kind of fact as a device being registered.
    _logger.info(
      'permission rule revoked',
      op: LogOp.permissionRuleRevoked,
      fields: <String, Object?>{'ruleId': ruleId},
    );
  }
}
