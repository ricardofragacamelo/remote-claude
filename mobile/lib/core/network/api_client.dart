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

/// A piece of a body read by range: its bytes, the type, and the size of the whole.
typedef RangeAnswer = ({Uint8List bytes, String? contentType, int total});

/// A `GET` that may be answered `304`: the body (`null` when nothing changed) and its version.
typedef VersionedAnswer = ({bool notModified, Object? data, String? etag});

/// How a download went: cut short by its caller, or written whole.
typedef DownloadAnswer = ({bool cancelled});

/// The first answer of a download, before its bytes: the version of the file and its type.
typedef DownloadHeaders = ({String? etag, String? contentType});

/// Stops a download from outside. What it already wrote stays where it is, for its owner to
/// delete.
class TransferCancel {
  final CancelToken _token = CancelToken();

  /// Stops the download — once; a second call does nothing.
  void cancel() {
    if (!_token.isCancelled) {
      _token.cancel();
    }
  }
}

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
  Future<ByteAnswer> bytes(String path, {Map<String, Object?>? query}) async {
    final Response<List<int>> response = await _rawGet(path, query, const <String, Object?>{});

    return (
      bytes: Uint8List.fromList(response.data ?? const <int>[]),
      contentType: response.headers.value(Headers.contentTypeHeader),
    );
  }

  /// A `GET` of the bytes from [start] to [end], inclusive — `206` with the size of the whole in
  /// `Content-Range` (plan 25, D-22). A server that sends the whole body instead is read as one
  /// piece of it. The credential travels in the header; the bytes are never logged.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<RangeAnswer> bytesRange(
    String path, {
    required int start,
    required int end,
    Map<String, Object?>? query,
  }) async {
    final Response<List<int>> response = await _rawGet(path, query, <String, Object?>{
      'range': 'bytes=$start-$end',
    });
    final Uint8List bytes = Uint8List.fromList(response.data ?? const <int>[]);

    return (
      bytes: bytes,
      contentType: response.headers.value(Headers.contentTypeHeader),
      total: totalOf(response.headers.value('content-range')) ?? bytes.length,
    );
  }

  /// A `GET` read as bytes, with [headers] besides the `accept` of anything.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<Response<List<int>>> _rawGet(
    String path,
    Map<String, Object?>? query,
    Map<String, Object?> headers,
  ) async {
    final String fallbackTraceId = _traceIds.next();

    try {
      return await _transport().get<List<int>>(
        path,
        queryParameters: query,
        options: Options(
          responseType: ResponseType.bytes,
          headers: <String, Object?>{'accept': '*/*', ...headers},
        ),
      );
    } on DioException catch (exception) {
      throw failureFromDio(exception, fallbackTraceId);
    }
  }

  /// A `GET` written **in stream** into the file at [into] — never whole in memory (plan 25,
  /// B-27). [onHeaders] hears the version and the type before the first byte; [onProgress], the
  /// bytes written so far and the size of the body (`-1` when the server did not say).
  ///
  /// From [from] on, it asks for the rest only — `Range` with [ifMatch], so a file that changed
  /// meanwhile is refused with `412` rather than stitched to the bytes before — and appends. A
  /// failure leaves what was written in place: resuming it, or deleting it, is the caller's.
  ///
  /// @throws [Failure] always, for the same reason as [get] — a cancellation is an answer, not one
  Future<DownloadAnswer> download(
    String path, {
    required String into,
    required void Function(int received, int total) onProgress,
    void Function(DownloadHeaders headers)? onHeaders,
    Map<String, Object?>? query,
    int from = 0,
    String? ifMatch,
    TransferCancel? cancel,
  }) async {
    final String fallbackTraceId = _traceIds.next();

    try {
      await _transport().download(
        path,
        (Headers headers) {
          onHeaders?.call((
            etag: headers.value('etag'),
            contentType: headers.value(Headers.contentTypeHeader),
          ));
          return into;
        },
        queryParameters: query,
        cancelToken: cancel?._token,
        deleteOnError: false,
        fileAccessMode: from == 0 ? FileAccessMode.write : FileAccessMode.append,
        onReceiveProgress: onProgress,
        options: Options(
          headers: <String, Object?>{
            'accept': '*/*',
            if (from > 0) 'range': 'bytes=$from-',
            'if-match': ?ifMatch,
          },
        ),
      );
      return (cancelled: false);
    } on DioException catch (exception) {
      if (CancelToken.isCancel(exception)) {
        return (cancelled: true);
      }
      throw failureFromDio(exception, fallbackTraceId);
    }
  }

  /// A `GET` of something that has a version: with [ifNoneMatch], the server answers `304` when the
  /// version is still the one on disk, and that is an answer, not a failure (plan 25, B-18). The
  /// version travels in the `ETag` header both ways.
  ///
  /// @throws [Failure] always, for the same reason as [get]
  Future<VersionedAnswer> getVersioned(
    String path, {
    Map<String, Object?>? query,
    String? ifNoneMatch,
  }) async {
    final String fallbackTraceId = _traceIds.next();

    try {
      final Response<Object?> response = await _transport().get<Object?>(
        path,
        queryParameters: query,
        options: Options(
          headers: <String, Object?>{'if-none-match': ?ifNoneMatch},
          validateStatus: (int? status) =>
              status != null && ((status >= 200 && status < 300) || status == 304),
        ),
      );
      final bool notModified = response.statusCode == 304;

      return (
        notModified: notModified,
        data: notModified ? null : response.data,
        etag: response.headers.value('etag'),
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

/// The size of the whole in a `Content-Range` (`bytes 0-1023/4096`) — `null` when there is none.
int? totalOf(String? contentRange) {
  final RegExpMatch? match = RegExp(r'/(\d+)\s*$').firstMatch(contentRange ?? '');
  return match == null ? null : int.parse(match.group(1)!);
}
