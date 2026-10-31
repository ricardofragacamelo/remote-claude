/// `GET /engines/claude/usage/rate-limits`, as the app calls it (plan 16, D-09).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/engines/claude/usage/data/datasources/http_usage_repository.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';

import '../../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() => http = ScriptedHttp());

  tearDown(() => http.dispose());

  HttpUsageRepository repo() => HttpUsageRepository(http.client);

  test('asks the one route, with no parameters', () async {
    http.adapter.body = '{"windows":[]}';

    await repo().rateLimits();

    expect(http.adapter.requests.single.method, 'GET');
    expect(http.adapter.requests.single.uri.path, '/engines/claude/usage/rate-limits');
    expect(http.adapter.requests.single.uri.queryParameters, isEmpty);
  });

  test('reads every window the body carries, through the one mapper this app trusts', () async {
    http.adapter.body =
        '{"windows":['
        '{"kind":"five_hour","status":"allowed","utilizationPercent":8,"resetsAt":null,'
        '"observedAt":"2026-10-26T12:00:00.000Z"}'
        ']}';

    final List<RateLimitWindow> windows = await repo().rateLimits();

    expect(windows, hasLength(1));
    expect(windows.single.kind, 'five_hour');
    expect(windows.single.utilizationPercent, 8);
  });

  test('a failure of the route arrives as a Failure, never an exception', () async {
    http.adapter
      ..status = 503
      ..body =
          '{"error":{"code":"AGENT_UNAVAILABLE","messageKey":"session.error.agentUnavailable","traceId":"t"}}';

    await expectLater(
      repo().rateLimits(),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'AGENT_UNAVAILABLE')),
    );
  });
}
