import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_rule_api_data_source.dart';
import 'package:remote_claude/features/permission/data/repositories/permission_rule_repository_impl.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

import '../../../../../support/fakes/recording_writer.dart';
import '../mappers/permission_rule_mapper_test.dart' show wireRule;

/// The backend, answering whatever the test set, and keeping what it was asked.
class _FakeApi implements PermissionRuleApiDataSource {
  Object? listed;
  Object? failure;
  final List<String> revoked = <String>[];

  @override
  Future<Object?> list() async => listed;

  @override
  Future<Object?> revoke(String ruleId) async {
    final Object? refused = failure;
    if (refused != null) {
      throw refused;
    }
    revoked.add(ruleId);
    return wireRule(<String, Object?>{'id': ruleId});
  }
}

void main() {
  late _FakeApi api;
  late RecordingWriter recorder;
  late AppLogger logger;
  late PermissionRuleRepositoryImpl repository;

  setUp(() {
    api = _FakeApi();
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    repository = PermissionRuleRepositoryImpl(api: api, logger: logger, traceIds: TraceIds());
  });

  tearDown(() => logger.dispose());

  test('lists the rules the backend answered', () async {
    api.listed = <String, Object?>{
      'rules': <Object?>[wireRule()],
    };

    final List<PermissionRule> rules = await repository.list();

    expect(rules.single.pattern, 'Bash(git status)');
  });

  test('refuses a body it cannot read rather than saying the user granted nothing', () async {
    api.listed = '<html>';

    await expectLater(
      repository.list(),
      throwsA(isA<ServerFailure>().having((Failure f) => f.code, 'code', 'INTERNAL_ERROR')),
    );
  });

  test('revokes, and says so in info — it changes what runs without asking', () async {
    await repository.revoke('rule_1');

    expect(api.revoked, <String>['rule_1']);
    expect(recorder.levels.last, 'info');
    expect(recorder.withOp(LogOp.permissionRuleRevoked).single['ruleId'], 'rule_1');
  });

  test('lets a refusal through as the failure it already is, and logs no revocation', () async {
    const ServerFailure notFound = ServerFailure(
      code: 'PERMISSION_RULE_NOT_FOUND',
      messageKey: 'permission.error.ruleNotFound',
      traceId: 't',
    );
    api.failure = notFound;

    await expectLater(repository.revoke('rule_1'), throwsA(notFound));
    expect(recorder.withOp(LogOp.permissionRuleRevoked), isEmpty);
  });
}
