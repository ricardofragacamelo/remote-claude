import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/failure_mapper.dart';

RequestOptions options() => RequestOptions(path: '/health');

DioException withResponse(int status, Object? body) => DioException(
  requestOptions: options(),
  response: Response<Object?>(requestOptions: options(), statusCode: status, data: body),
);

Map<String, Object?> envelope({
  Object? code = 'SESSION_NOT_FOUND',
  Object? messageKey = 'session.error.notFound',
  Object? traceId = 'trace-1',
  Object? params,
  Object? details,
}) => <String, Object?>{
  'error': <String, Object?>{
    'code': code,
    'messageKey': messageKey,
    'traceId': traceId,
    'params': ?params,
    'details': ?details,
  },
};

void main() {
  group('failureFromEnvelope', () {
    test('reads the backend envelope as it is', () {
      final Failure failure = failureFromEnvelope(envelope(), 'fallback');

      expect(failure, isA<ServerFailure>());
      expect(failure.code, 'SESSION_NOT_FOUND');
      expect(failure.messageKey, 'session.error.notFound');
      expect(failure.traceId, 'trace-1');
    });

    test('carries the interpolation params as strings', () {
      final Failure failure = failureFromEnvelope(
        envelope(params: <String, Object?>{'sessionId': 42}),
        'fallback',
      );

      expect(failure.params, <String, String>{'sessionId': '42'});
    });

    test('carries every invalid field, not just the first', () {
      final Failure failure = failureFromEnvelope(
        envelope(
          details: <Object?>[
            <String, Object?>{'field': 'nonce', 'rule': 'required'},
            <String, Object?>{'field': 'sessionId', 'rule': 'ulid'},
          ],
        ),
        'fallback',
      );

      expect(failure.details, hasLength(2));
      expect(failure.details.first.field, 'nonce');
      expect(failure.details.last.rule, 'ulid');
    });

    test('falls back to the trace we do have when the envelope carries none', () {
      expect(failureFromEnvelope(envelope(traceId: 1), 'fallback').traceId, 'fallback');
    });

    test('a body that is not an envelope still becomes something showable', () {
      expect(failureFromEnvelope('<html>502</html>', 'fallback'), isA<UnexpectedFailure>());
      expect(failureFromEnvelope(null, 'fallback'), isA<UnexpectedFailure>());
      expect(
        failureFromEnvelope(<String, Object?>{'error': 'nope'}, 'f'),
        isA<UnexpectedFailure>(),
      );
      expect(failureFromEnvelope(envelope(code: 1), 'f'), isA<UnexpectedFailure>());
      expect(failureFromEnvelope(envelope(messageKey: 1), 'f'), isA<UnexpectedFailure>());
    });
  });

  group('failureFromDio', () {
    test('no response at all is a network failure', () {
      final Failure failure = failureFromDio(
        DioException(requestOptions: options(), type: DioExceptionType.connectionTimeout),
        'fallback',
      );

      expect(failure, isA<NetworkFailure>());
      expect(failure.code, 'NETWORK_UNREACHABLE');
    });

    test('a 401 with nothing useful in it is still a sign-in problem', () {
      expect(failureFromDio(withResponse(401, null), 'f'), isA<AuthenticationFailure>());
    });

    test('a 401 that explained itself keeps its own code', () {
      final Failure failure = failureFromDio(
        withResponse(401, envelope(code: 'TOKEN_EXPIRED', messageKey: 'auth.error.tokenExpired')),
        'f',
      );

      expect(failure.code, 'TOKEN_EXPIRED');
    });

    test('any other status goes through the envelope', () {
      expect(failureFromDio(withResponse(404, envelope()), 'f'), isA<ServerFailure>());
    });
  });

  group('Failure', () {
    test('two failures with the same fields are equal', () {
      expect(const NetworkFailure(traceId: 't'), const NetworkFailure(traceId: 't'));
      expect(
        const FailureDetail(field: 'a', rule: 'b'),
        const FailureDetail(field: 'a', rule: 'b'),
      );
    });

    test('each variant carries the code the catalogue gives it', () {
      expect(const AuthenticationFailure(traceId: 't').code, 'UNAUTHENTICATED');
      expect(const UnexpectedFailure(traceId: 't').code, 'INTERNAL_ERROR');
    });
  });
}
