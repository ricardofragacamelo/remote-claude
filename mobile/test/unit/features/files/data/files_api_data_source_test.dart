import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';

import '../../../../support/builders/files.dart';
import '../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() {
    http = ScriptedHttp();
    http.adapter.body = '{"folder":"/w","path":"","entries":[],"truncated":false}';
  });

  tearDown(() => http.dispose());

  FilesApiDataSource source() => HttpFilesApiDataSource(http.client);

  test('asks for one level of the folder by GET, the folder and the path in the query', () async {
    await source().tree('/home/someone/project', 'docs/plans');

    final Uri uri = http.adapter.requests.single.uri;
    expect(http.adapter.requests.single.method, 'GET');
    expect(uri.path, '/files/tree');
    expect(uri.queryParameters, <String, String>{
      'folder': '/home/someone/project',
      'path': 'docs/plans',
    });
  });

  test('asks for the ceilings by GET', () async {
    http.adapter.body = '{"maxEditBytes":1}';
    await source().limits();

    expect(http.adapter.requests.single.method, 'GET');
    expect(http.adapter.requests.single.uri.path, '/files/limits');
  });

  for (final (int status, String code, String key) in <(int, String, String)>[
    (404, 'FILE_NOT_FOUND', 'files.error.notFound'),
    (422, 'FILE_ACCESS_DENIED', 'files.error.accessDenied'),
    (403, 'WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed'),
    (403, 'DEVICE_NOT_REGISTERED', 'auth.error.deviceNotRegistered'),
  ]) {
    test('S-20 · $status $code arrives as a Failure with the code of the catalogue', () async {
      http.adapter
        ..status = status
        ..body = refusal(code, key);

      await expectLater(
        FilesRepositoryImpl(source()).tree('/w', 'gone'),
        throwsA(isA<Failure>().having((Failure f) => f.code, 'code', code)),
      );
    });
  }

  test('the repository turns the answer into a level', () async {
    http.adapter.body =
        '{"folder":"/w","path":"","truncated":true,"entries":[{"name":"a","path":"a","kind":"file"}]}';

    final FileListing listing = await FilesRepositoryImpl(source()).tree('/w', '');

    expect(listing.entries.single.name, 'a');
    expect(listing.truncated, isTrue);
  });
}
