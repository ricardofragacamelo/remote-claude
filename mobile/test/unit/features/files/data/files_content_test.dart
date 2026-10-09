import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/datasources/stored_viewer_preferences.dart';
import 'package:remote_claude/features/files/data/mappers/tree_mapper.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';

import '../../../../support/builders/files.dart';
import '../../../../support/fakes/fake_credential_store.dart';
import '../../../../support/fakes/http_client.dart';

void main() {
  late ScriptedHttp http;

  setUp(() => http = ScriptedHttp());
  tearDown(() => http.dispose());

  test('the text is asked by GET, with the version named when there is one', () async {
    http.adapter.body = '{"content":"x"}';
    final HttpFilesApiDataSource source = HttpFilesApiDataSource(http.client);

    await source.content('/w', 'a.md');
    await source.content('/w', 'a.md', ifNoneMatch: '"v1"');

    expect(http.adapter.requests.first.method, 'GET');
    expect(http.adapter.requests.first.uri.path, '/files/content');
    expect(http.adapter.requests.first.uri.queryParameters, <String, String>{
      'folder': '/w',
      'path': 'a.md',
    });
    expect(http.adapter.requests.first.headers.containsKey('if-none-match'), isFalse);
    expect(http.adapter.requests.last.headers['if-none-match'], '"v1"');
  });

  test('a refusal of the text arrives as a Failure, never as a transport exception', () async {
    http.adapter
      ..status = 415
      ..body = refusal('FILE_NOT_TEXT', 'files.error.notText');

    await expectLater(
      HttpFilesApiDataSource(http.client).content('/w', 'a.bin'),
      throwsA(isA<Failure>().having((Failure f) => f.code, 'code', 'FILE_NOT_TEXT')),
    );
  });

  test('the bytes are asked by GET, the folder and the path in the query', () async {
    http.adapter
      ..bytes = <int>[1, 2, 3]
      ..contentType = 'image/png';

    final RawFile raw = await FilesRepositoryImpl(
      HttpFilesApiDataSource(http.client),
    ).raw('/w', 'a.png');

    expect(http.adapter.requests.single.uri.path, '/files/raw');
    expect(http.adapter.requests.single.uri.queryParameters, <String, String>{
      'folder': '/w',
      'path': 'a.png',
    });
    expect(raw.bytes, Uint8List.fromList(<int>[1, 2, 3]));
    expect(raw.contentType, 'image/png');
  });

  test(
    'S-50 · the mapper reads the encoding, the line ending, the size, the large flag and the version',
    () {
      final TextDocument document = documentFrom(<String, Object?>{
        'path': 'big.log',
        'content': 'hello',
        'etag': '"abc"',
        'encoding': 'latin1',
        'eol': 'crlf',
        'size': 2000000,
        'largeFile': true,
      });

      expect(
        document,
        const TextDocument(
          path: 'big.log',
          content: 'hello',
          etag: '"abc"',
          encoding: 'latin1',
          eol: 'crlf',
          size: 2000000,
          largeFile: true,
        ),
      );
      expect(documentFrom(null, etag: '"h"').etag, '"h"');
      expect(documentFrom(null).content, '');
    },
  );

  test(
    'S-56 · the wrap is kept in the app\'s store, outside the credentials, on until turned off',
    () async {
      final FakeCredentialStore store = FakeCredentialStore();
      final StoredViewerPreferences preferences = StoredViewerPreferences(store);

      expect(await preferences.wrap(), isTrue);
      await preferences.setWrap(wrap: false);
      expect(store.values[viewerWrapKey], 'false');
      expect(await StoredViewerPreferences(store).wrap(), isFalse);
    },
  );
}
