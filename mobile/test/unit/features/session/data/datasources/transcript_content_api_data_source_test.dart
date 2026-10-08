/// The routes of a conversation's content, as the app calls them — plan 22, B-32, B-33.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_content_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() => http = ScriptedHttp());

  tearDown(() => http.dispose());

  TranscriptContentApiDataSource source() => HttpTranscriptContentApiDataSource(http.client);

  group('the whole output of a tool', () {
    test('asks the route of the tool, every id a segment of its own', () async {
      http.adapter.body = '{"text":"ok","truncated":false,"bytes":2}';

      final Object? answered = await source().toolResult('c/1', 'toolu 1');

      expect(http.adapter.requests.single.method, 'GET');
      expect(http.adapter.requests.single.uri.path, '/transcripts/c%2F1/tools/toolu%201/result');
      expect(answered, <String, Object?>{'text': 'ok', 'truncated': false, 'bytes': 2});
    });

    test('both edges are logged, and what the tool said never is', () async {
      http.adapter.body = '{"text":"the secret output","truncated":false,"bytes":17}';

      await source().toolResult('c-1', 't1');

      expect(http.recorder.withOp(LogOp.httpRequest), hasLength(1));
      expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
      expect(http.recorder.lines.join('\n'), isNot(contains('the secret output')));
    });

    test('S-115 · a tool the chain has no result of arrives as a Failure', () async {
      http.adapter
        ..status = 404
        ..body =
            '{"error":{"code":"NOT_FOUND","messageKey":"transcript.error.notFound","traceId":"t"}}';

      await expectLater(
        source().toolResult('c-1', 't1'),
        throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'NOT_FOUND')),
      );
    });

    test('S-115 · a network that is not there arrives as a NetworkFailure', () async {
      http.adapter.unreachable.add('/transcripts/c-1/tools/t1/result');

      await expectLater(source().toolResult('c-1', 't1'), throwsA(isA<NetworkFailure>()));
    });
  });

  group('the image of a prompt', () {
    test('S-119 · answers the bytes as they came, and the type the server said', () async {
      http.adapter
        ..bytes = <int>[137, 80, 78, 71]
        ..contentType = 'image/png';

      final ByteAnswer answer = await source().promptImage('c-1', 'u1:1');

      expect(http.adapter.requests.single.uri.path, '/transcripts/c-1/images/u1%3A1');
      expect(answer.bytes, <int>[137, 80, 78, 71]);
      expect(answer.contentType, 'image/png');
    });

    test('S-122 · the credential travels in the header, never in the URL', () async {
      http.adapter
        ..bytes = <int>[1, 2, 3]
        ..contentType = 'image/png';

      await source().promptImage('c-1', 'u1:1');

      final Uri uri = http.adapter.requests.single.uri;
      expect(http.adapter.requests.single.headers['authorization'], 'Bearer token');
      expect(uri.query, isEmpty);
      expect(uri.toString(), isNot(contains('token')));
    });

    test('the bytes are never logged — only the path and the status', () async {
      http.adapter
        ..bytes = 'a private screenshot'.codeUnits
        ..contentType = 'image/png';

      await source().promptImage('c-1', 'u1:1');

      expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
      expect(http.recorder.lines.join('\n'), isNot(contains('a private screenshot')));
    });

    test(
      'S-120 · the refusals of the route arrive as their failures, read from the bytes',
      () async {
        final Map<int, (String, String)> refusals = <int, (String, String)>{
          415: ('UNSUPPORTED_MEDIA_TYPE', 'transcript.error.imageTypeUnsupported'),
          413: ('PAYLOAD_TOO_LARGE', 'transcript.error.imageTooLarge'),
          404: ('NOT_FOUND', 'transcript.error.notFound'),
        };

        for (final MapEntry<int, (String, String)> refusal in refusals.entries) {
          http.adapter
            ..status = refusal.key
            ..bytes =
                '{"error":{"code":"${refusal.value.$1}","messageKey":"${refusal.value.$2}",'
                        '"traceId":"t","params":{"mediaType":"image/svg+xml"}}}'
                    .codeUnits
            ..contentType = 'application/json';

          await expectLater(
            source().promptImage('c-1', 'u1:1'),
            throwsA(
              isA<ServerFailure>()
                  .having((Failure f) => f.code, 'code', refusal.value.$1)
                  .having((Failure f) => f.messageKey, 'messageKey', refusal.value.$2),
            ),
            reason: '${refusal.key}',
          );
        }
      },
    );
  });
}
