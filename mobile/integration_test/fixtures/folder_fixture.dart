/// The folder the file browser's e2e reads (plan 25, B-29, D-21, D-32).
///
/// Written here, as Dart, rather than as files beside the test: the test runs on a device, where
/// the repository is not there to read — the same reason the shared scenarios are compiled in. The
/// texts are literals; the PDF, the image and the binary are built when the test starts, each the
/// same bytes on every run, and sent to the folder through `/files/upload` by the browser's side.
library;

import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

/// The eight kinds of diagram both ends draw (S-04), and the one that does not parse.
const Map<String, String> diagrams = <String, String>{
  'flowchart': '''
flowchart TD
    A[Start] --> B{Is it a file?}
    B -->|Yes| C[Open the viewer]
    B -->|No| D[Enter the folder]
    C --> E[Read]
    D --> B
    click C href "https://example.com/never" "a link the image does not carry"''',
  'sequence': '''
sequenceDiagram
    participant App
    participant Backend
    App->>Backend: GET /files/tree
    Backend-->>App: entries''',
  'class': '''
classDiagram
    class FileEntry {
        +String name
        +int size
    }
    class FileListing {
        +bool truncated
    }
    FileListing "1" --> "*" FileEntry''',
  'state': '''
stateDiagram-v2
    [*] --> Loading
    Loading --> Content
    Loading --> Error
    Error --> Loading: retry
    Content --> [*]''',
  'er': '''
erDiagram
    USER ||--o{ DEVICE : owns
    USER ||--o{ SESSION : opens
    DEVICE {
        string installId
        string status
    }''',
  'gantt': '''
gantt
    title Plan 25
    dateFormat YYYY-MM-DD
    section Engines
    Spike :a1, 2026-10-09, 2d
    section App
    Panel :a2, after a1, 3d''',
  'pie': '''
pie title Files by kind
    "Markdown" : 42
    "Dart" : 30
    "PDF" : 8''',
  'mindmap': '''
mindmap
  root((File browser))
    Panel
      Breadcrumb
    Viewer
      Text
      PDF''',
};

/// A diagram with an error on its second line.
const String brokenDiagram = '''
flowchart TD
    A[Start] --> --> B''';

/// The markdown of the folder: a wide table, a relative link, the eight diagrams and the broken one.
final String notesMarkdown = <String>[
  '# Notes of the e2e',
  '',
  'A link to [the long text](docs/deep/long.txt).',
  '',
  '| ${List<String>.generate(12, (int column) => 'Column $column').join(' | ')} |',
  '|${List<String>.filled(12, '---').join('|')}|',
  '| ${List<String>.generate(12, (int column) => 'value $column of the wide table').join(' | ')} |',
  '',
  for (final MapEntry<String, String> diagram in diagrams.entries) ...<String>[
    '## ${diagram.key}',
    '',
    '```mermaid',
    diagram.value.trim(),
    '```',
    '',
  ],
  '## broken',
  '',
  '```mermaid',
  brokenDiagram.trim(),
  '```',
].join('\n');

/// A text of many lines, one of them longer than any screen.
final String longText = <String>[
  for (int line = 1; line <= 2000; line++) 'line $line of the long text',
  'x' * 5000,
].join('\n');

/// The pages of the long PDF (S-114).
const int longPdfPages = 500;

/// The files of the folder, by their path in it — every one sent before the test reads it.
Future<Map<String, Uint8List>> fixtureFiles() async => <String, Uint8List>{
  'notes.md': _utf8(notesMarkdown),
  'docs/deep/long.txt': _utf8(longText),
  'docs/readme.txt': _utf8('The readme of the docs.\n'),
  'one-page.pdf': pdfOf(1),
  'long.pdf': pdfOf(longPdfPages),
  'square.png': await squarePng(),
  'blob.bin': Uint8List.fromList(List<int>.generate(4096, (int index) => (index * 7) % 256)),
  // One of the names the server marks hidden (`HIDDEN_NAMES`): listed only with "show hidden".
  'Thumbs.db': _utf8('Only with "show hidden".\n'),
};

Uint8List _utf8(String text) => Uint8List.fromList(utf8.encode(text));

/// A PDF of [pages] pages, each saying its number — built by hand, objects and cross-reference
/// table, so the same bytes come out on every run without a library.
Uint8List pdfOf(int pages) {
  final List<String> objects = <String>[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [${List<String>.generate(pages, (int page) => '${4 + page * 2} 0 R').join(' ')}] /Count $pages >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (int page = 1; page <= pages; page++) {
    final String stream = 'BT /F1 36 Tf 60 400 Td (Page $page) Tj ET';
    objects
      ..add(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] '
        '/Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>',
      )
      ..add('<< /Length ${stream.length} >>\nstream\n$stream\nendstream');
  }

  final StringBuffer pdf = StringBuffer('%PDF-1.4\n');
  final List<int> offsets = <int>[];
  for (int index = 0; index < objects.length; index++) {
    offsets.add(pdf.length);
    pdf.write('${index + 1} 0 obj\n${objects[index]}\nendobj\n');
  }
  final int table = pdf.length;
  pdf
    ..write('xref\n0 ${objects.length + 1}\n0000000000 65535 f \n')
    ..writeAll(offsets.map((int offset) => '${offset.toString().padLeft(10, '0')} 00000 n \n'))
    ..write('trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n$table\n%%EOF\n');

  return Uint8List.fromList(latin1.encode(pdf.toString()));
}

/// A 96 × 96 PNG, half blue and half orange — something to see, and to zoom into.
Future<Uint8List> squarePng() async {
  final ui.PictureRecorder recorder = ui.PictureRecorder();
  ui.Canvas(recorder)
    ..drawRect(const ui.Rect.fromLTWH(0, 0, 96, 48), ui.Paint()..color = const ui.Color(0xFF1E88E5))
    ..drawRect(
      const ui.Rect.fromLTWH(0, 48, 96, 48),
      ui.Paint()..color = const ui.Color(0xFFFB8C00),
    );
  final ui.Image image = await recorder.endRecording().toImage(96, 96);
  final ByteData? png = await image.toByteData(format: ui.ImageByteFormat.png);

  return png!.buffer.asUint8List();
}
