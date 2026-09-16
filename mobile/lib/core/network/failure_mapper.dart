/// Where the outside world stops being exceptions.
///
/// Every `DioException` and every error envelope becomes a [Failure] here, in `core/network/`, so
/// that nothing above `data/` ever learns what Dio is. See
/// docs/architecture/mobile/01-architecture.md.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/error/failure.dart';

/// The backend's error envelope as a [Failure].
///
/// A body that does not look like the envelope — a proxy's HTML error page, a truncated
/// response — still has to become something the UI can show, so it becomes [UnexpectedFailure]
/// with whatever trace is available.
Failure failureFromEnvelope(Object? body, String fallbackTraceId) {
  if (body is! Map) {
    return UnexpectedFailure(traceId: fallbackTraceId);
  }

  final Object? wire = body['error'];
  if (wire is! Map) {
    return UnexpectedFailure(traceId: fallbackTraceId);
  }

  final Object? code = wire['code'];
  final Object? messageKey = wire['messageKey'];

  if (code is! String || messageKey is! String) {
    return UnexpectedFailure(traceId: fallbackTraceId);
  }

  final Object? traceId = wire['traceId'];
  final Object? params = wire['params'];
  final Object? details = wire['details'];

  return ServerFailure(
    code: code,
    messageKey: messageKey,
    traceId: traceId is String ? traceId : fallbackTraceId,
    params: params is Map
        ? <String, String>{
            for (final MapEntry<Object?, Object?> entry in params.entries)
              '${entry.key}': '${entry.value}',
          }
        : const <String, String>{},
    details: details is List
        ? details
              .whereType<Map<Object?, Object?>>()
              .map(
                (Map<Object?, Object?> item) =>
                    FailureDetail(field: '${item['field']}', rule: '${item['rule']}'),
              )
              .toList(growable: false)
        : const <FailureDetail>[],
  );
}

/// A `DioException` as a [Failure].
///
/// The distinction that matters is whether a server answered at all: a timeout and a refused
/// connection are [NetworkFailure], because retrying them can work and the user can be told why.
/// Anything with a response body goes through [failureFromEnvelope].
Failure failureFromDio(DioException exception, String fallbackTraceId) {
  final Response<Object?>? response = exception.response;

  if (response == null) {
    return NetworkFailure(traceId: fallbackTraceId);
  }

  final Failure mapped = failureFromEnvelope(response.data, fallbackTraceId);

  // A 401 whose body said nothing useful is still a 401, and the screen has to offer a sign-in
  // rather than the generic apology.
  if (mapped is UnexpectedFailure && response.statusCode == 401) {
    return AuthenticationFailure(traceId: fallbackTraceId);
  }

  return mapped;
}
