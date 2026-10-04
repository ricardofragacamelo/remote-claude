/// Testing an address over HTTP (plan 10, B-29): the health of the server, then its login.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/features/connection/data/datasources/http_connection_probe.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';

import '../../../support/fakes/recording_writer.dart';
import '../../../support/fakes/scripted_adapter.dart';

void main() {
  late ScriptedAdapter server;
  late RecordingWriter log;
  late HttpConnectionProbe probe;

  setUp(() {
    server = ScriptedAdapter();
    log = RecordingWriter();
    probe = HttpConnectionProbe(
      logger: AppLogger(
        context: const LogContext(appVersion: '1.0.0', platform: 'android'),
        writer: log.writer,
      ),
      dio: Dio()..httpClientAdapter = server,
    );
  });

  Future<ProbeResult> ask() =>
      probe.probe(origin: 'https://x.example', issuer: 'https://x.example/realms/rc');

  test('S-106 · the server and its login answer: ok, asked in that order, logged', () async {
    expect(await ask(), ProbeResult.ok);

    expect(server.requests.map((RequestOptions request) => request.uri.toString()), <String>[
      'https://x.example/api/health',
      'https://x.example/realms/rc/.well-known/openid-configuration',
    ]);
    expect(log.withOp('connection.probe'), hasLength(4));
  });

  test(
    'S-106 · nothing at the address: the server is out of reach, and the login is not asked',
    () async {
      server.unreachable.add('/api/health');

      expect(await ask(), ProbeResult.serverUnreachable);
      expect(server.requests, hasLength(1));
    },
  );

  test('S-106 · a server that answers with an error is out of reach too', () async {
    server.statusByPath['/api/health'] = 503;

    expect(await ask(), ProbeResult.serverUnreachable);
  });

  test('S-106 · the server answers and its login does not', () async {
    server.statusByPath['/realms/rc/.well-known/openid-configuration'] = 404;

    expect(await ask(), ProbeResult.loginUnavailable);
  });

  test('builds a client of its own when none is given', () {
    expect(
      HttpConnectionProbe(
        logger: AppLogger(
          context: const LogContext(appVersion: '1.0.0', platform: 'android'),
          writer: log.writer,
        ),
      ),
      isA<HttpConnectionProbe>(),
    );
  });
}
