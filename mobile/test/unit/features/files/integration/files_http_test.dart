@TestOn('vm')
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/datasources/remote_byte_reader.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';

import '../../../../support/fakes/local_file_server.dart';
import '../../../../support/fakes/recording_writer.dart';

/// The tree of the folder over a real socket (plan 25, B-09).
void main() {
  late LocalFileServer server;

  setUp(() async {
    server = await LocalFileServer.start();
    server.routes['/files/tree'] = (request) => LocalFileServer.json(<String, Object?>{
      'folder': request.uri.queryParameters['folder'],
      'path': request.uri.queryParameters['path'],
      'truncated': false,
      'entries': <Object?>[
        <String, Object?>{
          'name': 'secret-name.md',
          'path': 'secret-name.md',
          'kind': 'file',
          'size': 3,
        },
      ],
    });
  });

  tearDown(() => server.close());

  test('S-22 · the Bearer travels in the header, never in the address; both edges are logged, '
      'without the folder or the entries', () async {
    final ({ApiClient client, RecordingWriter log, AppLogger logger}) app = server.client();
    addTearDown(() => app.logger.dispose());

    final FileListing listing = await FilesRepositoryImpl(
      HttpFilesApiDataSource(app.client),
    ).tree('/home/someone/private', 'docs');

    expect(listing.entries.single.name, 'secret-name.md');
    final SeenRequest request = server.seen.single;
    expect(request.headers.value('authorization'), 'Bearer token');
    expect(request.uri.toString(), isNot(contains('token')));

    final List<Map<String, Object?>> logged = <Map<String, Object?>>[
      ...app.log.withOp(LogOp.httpRequest),
      ...app.log.withOp(LogOp.httpResponse),
    ];
    expect(logged, hasLength(2));
    expect(logged.every((Map<String, Object?> line) => line['level'] == 'debug'), isTrue);
    expect(jsonEncode(logged), isNot(contains('private')));
    expect(jsonEncode(logged), isNot(contains('secret-name')));
  });

  test(
    'S-21 · a name with accents, spaces, an emoji and 255 bytes goes and comes back intact',
    () async {
      final ({ApiClient client, RecordingWriter log, AppLogger logger}) app = server.client();
      addTearDown(() => app.logger.dispose());
      final String long = 'á' * 127 + 'b';
      expect(utf8.encode(long), hasLength(255));
      const String folder = '/home/someone/Pasta com espaço 🚀';
      final String path = 'ação e reação/$long';

      final FileListing listing = await FilesRepositoryImpl(
        HttpFilesApiDataSource(app.client),
      ).tree(folder, path);

      expect(server.seen.single.uri.path, '/files/tree');
      expect(server.seen.single.uri.queryParameters, <String, String>{
        'folder': folder,
        'path': path,
      });
      expect(listing.folder, folder);
      expect(listing.path, path);
    },
  );

  test(
    'S-74 · the text comes with its version; named again, the server answers 304 and nothing changes',
    () async {
      final ({ApiClient client, RecordingWriter log, AppLogger logger}) app = server.client();
      addTearDown(() => app.logger.dispose());
      server.routes['/files/content'] = (request) =>
          request.headers.value('if-none-match') == '"v1"'
          ? (status: 304, headers: <String, String>{'etag': '"v1"'}, body: <int>[])
          : LocalFileServer.json(
              <String, Object?>{'path': 'a.md', 'content': 'secret text', 'size': 11},
              headers: <String, String>{'etag': '"v1"'},
            );
      final FilesRepositoryImpl repository = FilesRepositoryImpl(
        HttpFilesApiDataSource(app.client),
      );

      final TextRead first = await repository.content('/w', 'a.md');
      final TextRead again = await repository.content('/w', 'a.md', ifNoneMatch: '"v1"');

      expect((first as TextChanged).document.etag, '"v1"');
      expect(first.document.content, 'secret text');
      expect(again, isA<TextUnchanged>());
      expect(server.seen.last.headers.value('if-none-match'), '"v1"');
      expect(jsonEncode(app.log.records), isNot(contains('secret text')));
    },
  );

  test('S-66 · the bytes of an image arrive by /files/raw, the Bearer in the header', () async {
    final ({ApiClient client, RecordingWriter log, AppLogger logger}) app = server.client();
    addTearDown(() => app.logger.dispose());
    server.routes['/files/raw'] = (request) =>
        LocalFileServer.bytes(Uint8List.fromList(<int>[137, 80, 78, 71]), type: 'image/png');

    final RawFile raw = await FilesRepositoryImpl(
      HttpFilesApiDataSource(app.client),
    ).raw('/w', 'a.png');

    expect(raw.bytes, <int>[137, 80, 78, 71]);
    expect(raw.contentType, 'image/png');
    expect(server.seen.single.headers.value('authorization'), 'Bearer token');
    expect(server.seen.single.uri.queryParameters['path'], 'a.png');
  });

  test(
    'S-107 · the PDF is read by Range, the Bearer in the header and never in the address',
    () async {
      final ({ApiClient client, RecordingWriter log, AppLogger logger}) app = server.client();
      addTearDown(() => app.logger.dispose());
      final Uint8List file = Uint8List.fromList(List<int>.generate(3000, (int at) => at & 0xff));
      server.routes['/files/raw'] = (request) {
        final RegExpMatch range = RegExp(
          r'bytes=(\d+)-(\d+)',
        ).firstMatch(request.headers.value('range')!)!;
        final int start = int.parse(range.group(1)!);
        final int end = int.parse(range.group(2)!).clamp(0, file.length - 1);
        return (
          status: 206,
          headers: <String, String>{
            'content-type': 'application/pdf',
            'content-range': 'bytes $start-$end/${file.length}',
          },
          body: file.sublist(start, end + 1),
        );
      };
      final RemoteByteReader reader = RemoteByteReader(
        HttpFilesApiDataSource(app.client),
        folder: '/w',
        path: 'docs/report.pdf',
      );

      final ByteProbe probe = await reader.probe();
      final Uint8List piece = await reader.read(2990, 50);

      expect(probe.size, 3000);
      expect(probe.contentType, 'application/pdf');
      expect(piece, file.sublist(2990));
      expect(server.seen.first.headers.value('range'), 'bytes=0-${readBlock - 1}');
      expect(server.seen.first.headers.value('authorization'), 'Bearer token');
      expect(server.seen.first.uri.toString(), isNot(contains('token')));
      expect(server.seen.first.uri.queryParameters['path'], 'docs/report.pdf');
    },
  );
}
