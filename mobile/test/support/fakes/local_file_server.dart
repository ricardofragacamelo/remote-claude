/// A real HTTP server on the loopback, answering the file routes — the integration level of the
/// file browser (plan 25): the real Dio, every interceptor and a socket, against `dart:io`.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';

import 'fake_credentials.dart';
import 'recording_writer.dart';

/// One request as the server saw it.
typedef SeenRequest = ({String method, Uri uri, HttpHeaders headers});

/// What a route answers: the status, the headers and the body.
typedef Answer = ({int status, Map<String, String> headers, List<int> body});

/// The server, what it saw, and a client of the app pointed at it.
class LocalFileServer {
  LocalFileServer._(this._server) {
    _server.listen(_serve);
  }

  /// Starts on an ephemeral loopback port.
  static Future<LocalFileServer> start() async =>
      LocalFileServer._(await HttpServer.bind(InternetAddress.loopbackIPv4, 0));

  final HttpServer _server;

  /// Every request, in order.
  final List<SeenRequest> seen = <SeenRequest>[];

  /// What each path answers, by the request.
  final Map<String, FutureOr<Answer> Function(HttpRequest request)> routes =
      <String, FutureOr<Answer> Function(HttpRequest request)>{};

  /// Paths whose handler writes the response itself — a body in pieces, a connection cut on the
  /// way. Asked after the credential is checked.
  final Map<String, Future<void> Function(HttpRequest request)> streams =
      <String, Future<void> Function(HttpRequest request)>{};

  /// The token the server accepts.
  String acceptedToken = 'token';

  /// Where the server listens.
  String get origin => 'http://127.0.0.1:${_server.port}';

  /// A JSON answer.
  static Answer json(
    Object? body, {
    int status = 200,
    Map<String, String> headers = const <String, String>{},
  }) => (
    status: status,
    headers: <String, String>{'content-type': 'application/json', ...headers},
    body: utf8.encode(jsonEncode(body)),
  );

  /// A bytes answer.
  static Answer bytes(
    Uint8List body, {
    String type = 'application/octet-stream',
    int status = 200,
  }) => (status: status, headers: <String, String>{'content-type': type}, body: body);

  Future<void> _serve(HttpRequest request) async {
    seen.add((method: request.method, uri: request.uri, headers: request.headers));

    final Future<void> Function(HttpRequest request)? stream = streams[request.uri.path];
    if (stream != null && request.headers.value('authorization') == 'Bearer $acceptedToken') {
      await stream(request);
      return;
    }

    final Answer answer = request.headers.value('authorization') != 'Bearer $acceptedToken'
        ? json(<String, Object?>{
            'error': <String, Object?>{
              'code': 'UNAUTHENTICATED',
              'messageKey': 'auth.error.unauthenticated',
              'traceId': 't',
            },
          }, status: 401)
        : await (routes[request.uri.path]?.call(request) ?? json(null, status: 404));

    request.response.statusCode = answer.status;
    answer.headers.forEach(request.response.headers.set);
    request.response.add(answer.body);
    await request.response.close();
  }

  /// A client of the app, the real Dio with every interceptor, over this server.
  ({ApiClient client, RecordingWriter log, AppLogger logger}) client({
    FakeCredentials? credentials,
  }) {
    final RecordingWriter log = RecordingWriter();
    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: log.writer,
    );
    final Dio dio = buildDio(
      baseUrl: origin,
      credentials: credentials ?? FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );

    return (client: ApiClient(dio, TraceIds()), log: log, logger: logger);
  }

  Future<void> close() => _server.close(force: true);
}
