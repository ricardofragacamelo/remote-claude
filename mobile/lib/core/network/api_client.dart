/// The HTTP client. There is exactly one in the application.
///
/// Its whole job is transport: the credential, the trace, the language, the timeout, the single
/// retry, the logging of both edges, and turning the backend's error envelope into a [Failure].
/// It knows no endpoint — that is the data source's job — and it holds no business rule.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/failure_mapper.dart';
import 'package:remote_claude/core/network/interceptors/auth_interceptor.dart';
import 'package:remote_claude/core/network/interceptors/logging_interceptor.dart';
import 'package:remote_claude/core/network/interceptors/trace_interceptor.dart';
import 'package:remote_claude/core/network/trace.dart';

/// How long a request may take before it is abandoned. Every external call has a deadline.
const Duration requestTimeout = Duration(seconds: 15);

/// Builds the configured Dio. Exposed so a test can hand it an adapter instead of a network.
Dio buildDio({
  required String baseUrl,
  required CredentialSource credentials,
  required AppLogger logger,
  required TraceIds traceIds,
  InstallIdSource? installIds,
}) {
  final Dio dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: requestTimeout,
      receiveTimeout: requestTimeout,
      sendTimeout: requestTimeout,
      headers: <String, Object?>{'accept': 'application/json'},
    ),
  );

  // Order matters: the trace has to exist before the logger reads it, and the credential has to
  // be on the request before anything can be refused for lacking one.
  dio.interceptors.add(
    TraceInterceptor(credentials: credentials, traceIds: traceIds, installIds: installIds),
  );
  dio.interceptors.add(AuthInterceptor(credentials: credentials, dio: dio));
  dio.interceptors.add(IoLoggingInterceptor(logger: logger));

  return dio;
}

/// The client the data sources call.
class ApiClient {
  ApiClient(this._dio, this._traceIds);

  final Dio _dio;
  final TraceIds _traceIds;

  /// A `GET`.
  ///
  /// @throws [Failure] always — a problem never reaches a caller as a `DioException`, because
  ///   then every caller would have to know what Dio is
  Future<Object?> get(String path) => _send(() => _dio.get<Object?>(path));

  /// A `POST`.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Object?> post(String path, {Object? body}) =>
      _send(() => _dio.post<Object?>(path, data: body));

  /// A `DELETE`.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Object?> delete(String path) => _send(() => _dio.delete<Object?>(path));

  Future<Object?> _send(Future<Response<Object?>> Function() call) async {
    final String fallbackTraceId = _traceIds.next();

    try {
      final Response<Object?> response = await call();
      return response.data;
    } on DioException catch (exception) {
      throw failureFromDio(exception, fallbackTraceId);
    }
  }
}
