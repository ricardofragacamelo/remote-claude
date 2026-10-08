/// The HTTP client. There is exactly one in the application.
///
/// Its whole job is transport: the credential, the trace, the language, the timeout, the single
/// retry, the logging of both edges, and turning the backend's error envelope into a [Failure].
/// It knows no endpoint — that is the data source's job — and it holds no business rule.
library;

import 'dart:typed_data';

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

/// A body read as bytes, and the type the server said it is.
typedef ByteAnswer = ({Uint8List bytes, String? contentType});

/// The client the data sources call.
class ApiClient {
  ApiClient(Dio dio, TraceIds traceIds) : this.over(() => dio, traceIds);

  /// A client that asks [transport] for the Dio on every request — the one of the origin in use
  /// now. It is what lets the client outlive a change of address while the transport does not
  /// (plan 10, F10).
  ApiClient.over(this._transport, this._traceIds);

  final Dio Function() _transport;
  final TraceIds _traceIds;

  /// A `GET`, with [query] as its query string.
  ///
  /// The query travels apart from the path rather than spliced into it: Dio encodes it, and the
  /// logging interceptor reports the path alone — a cursor or a folder name is not what an I/O
  /// log line is for.
  ///
  /// @throws [Failure] always — a problem never reaches a caller as a `DioException`, because
  ///   then every caller would have to know what Dio is
  Future<Object?> get(String path, {Map<String, Object?>? query}) =>
      _send(() => _transport().get<Object?>(path, queryParameters: query));

  /// A `POST`.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Object?> post(String path, {Object? body}) =>
      _send(() => _transport().post<Object?>(path, data: body));

  /// A `PUT`.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Object?> put(String path, {Object? body}) =>
      _send(() => _transport().put<Object?>(path, data: body));

  /// A `DELETE`, with [query] as its query string — where a folder travels, never in the path, so
  /// a proxy that normalises `%2F` cannot change it (backend `workspace` routes).
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Object?> delete(String path, {Map<String, Object?>? query}) =>
      _send(() => _transport().delete<Object?>(path, queryParameters: query));

  /// A `GET` whose answer is not JSON — an image, say: the bytes as they came, and their type.
  ///
  /// The credential travels in the header like every other request, never in the URL (plan 22,
  /// D-10). The bytes are never logged: the logging interceptor reports the path and the status.
  ///
  /// @throws [Failure] always, for the same reason as [get] — a refusal's envelope is read from the
  ///   bytes it came in
  Future<ByteAnswer> bytes(String path) async {
    final String fallbackTraceId = _traceIds.next();

    try {
      final Response<List<int>> response = await _transport().get<List<int>>(
        path,
        options: Options(
          responseType: ResponseType.bytes,
          headers: <String, Object?>{'accept': '*/*'},
        ),
      );

      return (
        bytes: Uint8List.fromList(response.data ?? const <int>[]),
        contentType: response.headers.value(Headers.contentTypeHeader),
      );
    } on DioException catch (exception) {
      throw failureFromDio(exception, fallbackTraceId);
    }
  }

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
