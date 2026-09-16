import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';

void main() {
  test('each variant carries the code and key of the catalogue', () {
    const List<Failure> failures = <Failure>[
      NetworkFailure(traceId: 't'),
      AuthenticationFailure(traceId: 't'),
      UnexpectedFailure(traceId: 't'),
      ServerFailure(code: 'SESSION_NOT_FOUND', messageKey: 'session.error.notFound', traceId: 't'),
    ];

    expect(failures.map((Failure failure) => failure.code), <String>[
      'NETWORK_UNREACHABLE',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
      'SESSION_NOT_FOUND',
    ]);
    expect(failures.map((Failure failure) => failure.messageKey), <String>[
      'common.error.offline',
      'auth.error.unauthenticated',
      'common.error.unexpected',
      'session.error.notFound',
    ]);
  });

  test('every failure carries a trace, so a report can be found in the log', () {
    const Failure failure = NetworkFailure(traceId: 'trace-1');

    expect(failure.traceId, 'trace-1');
    expect(failure.params, isEmpty);
    expect(failure.details, isEmpty);
  });

  test('an expired token is an authentication failure with its own key', () {
    const Failure failure = AuthenticationFailure(
      traceId: 't',
      code: 'TOKEN_EXPIRED',
      messageKey: 'auth.error.tokenExpired',
    );

    expect(failure.code, 'TOKEN_EXPIRED');
    expect(failure.messageKey, 'auth.error.tokenExpired');
  });

  test('a switch over the sealed type is exhaustive', () {
    String name(Failure failure) => switch (failure) {
      NetworkFailure() => 'network',
      AuthenticationFailure() => 'auth',
      ServerFailure() => 'server',
      UnexpectedFailure() => 'unexpected',
    };

    expect(name(const NetworkFailure(traceId: 't')), 'network');
    expect(name(const AuthenticationFailure(traceId: 't')), 'auth');
    expect(name(const UnexpectedFailure(traceId: 't')), 'unexpected');
    expect(name(const ServerFailure(code: 'X', messageKey: 'y', traceId: 't')), 'server');
  });

  test('two failures of the same kind and contents are equal', () {
    // Built at runtime rather than as constants: two identical `const` expressions are the same
    // instance, and identity would answer before the comparison this test is about.
    final String trace = 'trace-${DateTime.now().microsecondsSinceEpoch}';

    expect(NetworkFailure(traceId: trace), NetworkFailure(traceId: trace));
    expect(NetworkFailure(traceId: trace), isNot(AuthenticationFailure(traceId: trace)));
    expect(
      ServerFailure(code: 'X', messageKey: 'y', traceId: trace),
      ServerFailure(code: 'X', messageKey: 'y', traceId: trace),
    );
    expect(
      ServerFailure(code: 'X', messageKey: 'y', traceId: trace),
      isNot(ServerFailure(code: 'Z', messageKey: 'y', traceId: trace)),
    );
    expect(FailureDetail(field: 'a', rule: trace).props, <String>['a', trace]);
  });
}
