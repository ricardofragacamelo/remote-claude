import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';
import 'package:remote_claude/features/files/domain/services/text_rows.dart';
import 'package:remote_claude/features/files/domain/services/viewer_for.dart';
import 'package:remote_claude/features/files/domain/services/zoom.dart';

void main() {
  group('S-46 · the extension picks the viewer, whatever its case', () {
    for (final (String path, ViewerKind kind) in <(String, ViewerKind)>[
      ('docs/a.md', ViewerKind.markdown),
      ('A.MARKDOWN', ViewerKind.markdown),
      ('page.mdx', ViewerKind.markdown),
      ('report.pdf', ViewerKind.pdf),
      ('Report.PDF', ViewerKind.pdf),
      ('a.png', ViewerKind.image),
      ('a.JPG', ViewerKind.image),
      ('a.jpeg', ViewerKind.image),
      ('a.gif', ViewerKind.image),
      ('a.webp', ViewerKind.image),
      ('a.bmp', ViewerKind.image),
      ('src/main.dart', ViewerKind.text),
      ('notes.txt', ViewerKind.text),
    ]) {
      test('$path → $kind', () => expect(viewerFor(path), kind));
    }
  });

  test('S-47 · an SVG, a name with no extension and a dotfile open as text', () {
    expect(viewerFor('logo.svg'), ViewerKind.text);
    expect(viewerFor('Makefile'), ViewerKind.text);
    expect(viewerFor('.env'), ViewerKind.text);
    expect(extensionOf('.env'), '');
    expect(extensionOf('dir.d/Makefile'), '');
  });

  test(
    'S-48 · the type the server read confirms the PDF and the image, or the engine gets nothing',
    () {
      expect(confirms(ViewerKind.pdf, 'application/pdf'), isTrue);
      expect(confirms(ViewerKind.pdf, 'application/octet-stream'), isFalse);
      expect(confirms(ViewerKind.pdf, null), isFalse);
      expect(confirms(ViewerKind.image, 'image/png'), isTrue);
      expect(confirms(ViewerKind.image, 'IMAGE/JPEG; charset=binary'), isTrue);
      expect(confirms(ViewerKind.image, 'image/svg+xml'), isFalse);
      expect(confirms(ViewerKind.image, 'text/plain'), isFalse);
      expect(confirms(ViewerKind.text, null), isTrue);
    },
  );

  test(
    'S-49 · the viewer route carries the folder and the path in the query, and reads them back',
    () {
      const String folder = '/home/someone/Pasta com acento';
      const String path = 'docs/ação e reação/a b.md';
      final Uri uri = Uri.parse(viewerRouteFor(folder, path, sessionId: 'session-1'));

      expect(uri.path, fileViewerRoute);
      expect(uri.queryParameters[viewerFolderParameter], folder);
      expect(uri.queryParameters[viewerPathParameter], path);
      expect(uri.queryParameters[viewerSessionParameter], 'session-1');
      expect(
        Uri.parse(viewerRouteFor(folder, path)).queryParameters.containsKey('session'),
        isFalse,
      );
    },
  );

  group('the rows of a text — D-25', () {
    test('one row per line, numbered; a final line break makes no empty line', () {
      expect(textRows('a\nb\r\nc\rd\n', wrap: true), const <TextRow>[
        TextRow(number: 1, text: 'a'),
        TextRow(number: 2, text: 'b'),
        TextRow(number: 3, text: 'c'),
        TextRow(number: 4, text: 'd'),
      ]);
      expect(textRows('a\n\nb', wrap: true).map((TextRow r) => r.text), <String>['a', '', 'b']);
    });

    test('S-59 · an empty text has no rows', () => expect(textRows('', wrap: true), isEmpty));

    test('S-58 · a long line wraps in pieces, the number on the first', () {
      final List<TextRow> rows = textRows('x' * 2500, wrap: true);

      expect(rows.map((TextRow r) => r.text.length), <int>[1000, 1000, 500]);
      expect(rows.map((TextRow r) => r.number), <int?>[1, null, null]);
    });

    test('S-58 · with the wrap off, a line past the cut shows its start and how much is left', () {
      final List<TextRow> rows = textRows('${'y' * 10500}\nshort', wrap: false);

      expect(rows.first.text.length, cutAt);
      expect(rows.first.cut, 500);
      expect(rows.last, const TextRow(number: 2, text: 'short'));
      expect(longestRow(rows), cutAt);
    });
  });

  test('S-64 · the scale of the text stops at 50 % and at 300 %', () {
    expect(clampTextScale(0.1), 0.5);
    expect(clampTextScale(1.4), 1.4);
    expect(clampTextScale(9), 3);
  });
}
