/// The workspace endpoint, as the app calls it.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';

import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/recording_writer.dart';
import '../../../../../support/fakes/scripted_adapter.dart';

void main() {
  late AppLogger logger;
  late ScriptedAdapter adapter;

  setUp(() {
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
    adapter = ScriptedAdapter()..body = '{"workspaces":[{"path":"/p","label":"p"}]}';
  });

  tearDown(() => logger.dispose());

  WorkspaceApiDataSource build() {
    final Dio dio = buildDio(
      baseUrl: 'http://localhost:3000',
      credentials: FakeCredentials(),
      logger: logger,
      traceIds: TraceIds(),
    );
    dio.httpClientAdapter = adapter;

    return HttpWorkspaceApiDataSource(ApiClient(dio, TraceIds()));
  }

  test('reads the allowlist from the one endpoint there is', () async {
    final Object? answered = await build().list();

    expect(adapter.requests.single.path, '/workspaces');
    expect(adapter.requests.single.method, 'GET');
    expect(answered, <String, Object?>{
      'workspaces': <Object?>[
        <String, Object?>{'path': '/p', 'label': 'p'},
      ],
    });
  });

  test('lets a refusal through as a Failure, never as a transport exception', () async {
    adapter.status = 401;
    adapter.body =
        '{"error":{"code":"UNAUTHENTICATED","messageKey":"auth.error.unauthenticated","traceId":"t"}}';

    await expectLater(
      build().list(),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'UNAUTHENTICATED')),
    );
  });

  // Plan 10, B-38: the folder travels in the body or the query, never in the path.
  test('S-141 · the open folders, the recent ones and the picker, each at its endpoint', () async {
    final WorkspaceApiDataSource api = build();

    await api.openFolders();
    await api.openFolder('/w/a b');
    await api.closeFolder('/w/a b');
    await api.recent();
    await api.pinRecent('/w/a', pinned: true);
    await api.forgetRecent('/w/a');
    await api.directories('/w');

    expect(adapter.requests.map((RequestOptions r) => '${r.method} ${r.path}'), <String>[
      'GET /workspaces/open-folders',
      'POST /workspaces/open-folders',
      'DELETE /workspaces/open-folders',
      'GET /workspaces/recent',
      'PUT /workspaces/recent/pin',
      'DELETE /workspaces/recent',
      'GET /workspaces/directories',
    ]);
    expect(adapter.requests[1].data, <String, Object?>{'path': '/w/a b'});
    expect(adapter.requests[2].queryParameters, <String, Object?>{'path': '/w/a b'});
    expect(adapter.requests[4].data, <String, Object?>{'path': '/w/a', 'pinned': true});
    expect(adapter.requests[5].queryParameters, <String, Object?>{'path': '/w/a'});
    expect(adapter.requests[6].queryParameters, <String, Object?>{'path': '/w'});
  });
}
