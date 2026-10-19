/// The audit repository: the trail, as the entities the trail page draws.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/data/datasources/audit_api_data_source.dart';
import 'package:remote_claude/features/audit/data/repositories/audit_repository_impl.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';

/// Answers whatever the test set, and remembers who asked.
class _ScriptedApi implements AuditApiDataSource {
  Object? body;
  final List<(String, String, String?)> asked = <(String, String, String?)>[];

  @override
  Future<Object?> page({required String sessionId, required String kind, String? cursor}) async {
    asked.add((sessionId, kind, cursor));
    return body;
  }
}

void main() {
  late _ScriptedApi api;

  setUp(() => api = _ScriptedApi());

  test('reads the page the body describes, for the session and the kind asked about', () async {
    api.body = <String, Object?>{
      'entries': <Object?>[
        <String, Object?>{
          'id': 'e1',
          'sessionId': 's1',
          'toolUseId': 't1',
          'toolName': 'Bash',
          'kind': 'shell',
          'input': <String, Object?>{},
          'decision': 'allowed',
          'at': '2026-09-26T12:00:00.000Z',
          'traceId': null,
          'verdict': null,
        },
      ],
      'nextCursor': 'c-1',
    };

    final AuditEntryPage page = await AuditRepositoryImpl(api).page(sessionId: 's1', kind: 'shell');

    expect(page.entries.single.id, 'e1');
    expect(page.nextCursor, 'c-1');
    expect(api.asked, <(String, String, String?)>[('s1', 'shell', null)]);
  });

  test('carries the cursor through, unchanged', () async {
    api.body = <String, Object?>{'entries': <Object?>[], 'nextCursor': null};

    await AuditRepositoryImpl(api).page(sessionId: 's1', kind: 'shell', cursor: '42');

    expect(api.asked, <(String, String, String?)>[('s1', 'shell', '42')]);
  });

  test('a body this build cannot read is a failure, not a crash', () async {
    api.body = 'nope';

    await expectLater(
      AuditRepositoryImpl(api).page(sessionId: 's1', kind: 'shell'),
      throwsA(isA<UnexpectedFailure>()),
    );
  });
}
