/// `GET /audit-entries`, as the app calls it (plan 26, B-32).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/data/datasources/audit_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"entries":[],"nextCursor":null}';
  });

  tearDown(() => http.dispose());

  AuditApiDataSource source() => HttpAuditApiDataSource(http.client);

  test('asks the trail for a session and a kind, no cursor by default', () async {
    await source().page(sessionId: 's/1', kind: 'file.edit');

    expect(http.adapter.requests.single.method, 'GET');
    expect(http.adapter.requests.single.uri.path, '/audit-entries');
    expect(http.adapter.requests.single.uri.queryParameters, <String, String>{
      'sessionId': 's/1',
      'kind': 'file.edit',
    });
  });

  test('carries the cursor of a later page, when asked for one', () async {
    await source().page(sessionId: 's1', kind: 'shell', cursor: '42');

    expect(http.adapter.requests.single.uri.queryParameters['cursor'], '42');
  });

  test('S-89 · a failure of the route arrives as a Failure, never an exception', () async {
    http.adapter
      ..status = 403
      ..body = '{"error":{"code":"FORBIDDEN","messageKey":"common.error.forbidden","traceId":"t"}}';

    await expectLater(
      source().page(sessionId: 's1', kind: 'shell'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'FORBIDDEN')),
    );
  });
}
