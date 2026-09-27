/// The listing endpoint of the history, as the app calls it.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/transcript/data/datasources/transcript_api_data_source.dart';

import '../../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"sessions":[],"nextCursor":null}';
  });

  tearDown(() => http.dispose());

  TranscriptApiDataSource source() => HttpTranscriptApiDataSource(http.client);

  test('S-12 · asks for the conversations of exactly the workspace it was given', () async {
    final Object? answered = await source().list('/home/someone/my project');

    final Uri uri = http.adapter.requests.single.uri;
    expect(http.adapter.requests.single.method, 'GET');
    expect(uri.path, '/transcripts');
    expect(uri.queryParameters, <String, String>{'workspacePath': '/home/someone/my project'});
    expect(answered, <String, Object?>{'sessions': <Object?>[], 'nextCursor': null});
  });

  test('the next page passes the cursor back as it came', () async {
    await source().list('/p', cursor: 'opaque==');

    expect(http.adapter.requests.single.uri.queryParameters['cursor'], 'opaque==');
  });

  test('both edges are logged by the client, the path alone and not the folder', () async {
    await source().list('/home/someone/private');

    expect(http.recorder.withOp(LogOp.httpRequest).single['url'], '/transcripts');
    expect(http.recorder.withOp(LogOp.httpResponse), hasLength(1));
  });

  test('a refusal arrives as a Failure, never as a transport exception', () async {
    http.adapter
      ..status = 403
      ..body =
          '{"error":{"code":"WORKSPACE_NOT_ALLOWED","messageKey":"workspace.error.notAllowed","traceId":"t"}}';

    await expectLater(
      source().list('/etc'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'WORKSPACE_NOT_ALLOWED')),
    );
  });
}
