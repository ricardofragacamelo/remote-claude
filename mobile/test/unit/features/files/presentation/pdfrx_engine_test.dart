import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:remote_claude/features/files/presentation/engines/pdfrx_engine.dart';

import '../../../../support/fakes/fake_files_repository.dart';

/// PDFium played by the test: a document of three pages, a locked one, a broken one.
class _Pdfium extends Fake implements PdfrxEntryFunctions {
  /// The password that opens the locked document — `null` for an open document.
  String? lockedWith;
  bool broken = false;

  /// What `read` gave the engine, for the first bytes.
  Uint8List? read;
  String? sourceName;

  @override
  Future<PdfDocument> openCustom({
    required FutureOr<int> Function(Uint8List buffer, int position, int size) read,
    required int fileSize,
    required String sourceName,
    PdfPasswordProvider? passwordProvider,
    bool firstAttemptByEmptyPassword = true,
    bool useProgressiveLoading = false,
    int? maxSizeToCacheOnMemory,
    void Function()? onDispose,
  }) async {
    final Uint8List buffer = Uint8List(4);
    await read(buffer, 0, 4);
    this.read = buffer;
    this.sourceName = sourceName;
    if (broken) {
      throw const PdfException('Failed to load PDF document (FPDF_ERR_FORMAT: 3).');
    }
    final String? locked = lockedWith;
    if (locked != null) {
      final String? given = await passwordProvider?.call();
      if (given != locked) {
        throw const PdfPasswordException('password');
      }
    }
    return _Document(sourceName);
  }
}

class _Document extends Fake implements PdfDocument {
  _Document(this.sourceName);

  @override
  final String sourceName;

  bool disposed = false;

  @override
  List<PdfPage> get pages => <PdfPage>[_Page(), _Page(), _Page()];

  @override
  Future<void> dispose() async => disposed = true;
}

class _Page extends Fake implements PdfPage {}

/// A viewer already laid out, which records where it was sent.
class _ReadyController extends Fake implements PdfViewerController {
  final List<int> wentTo = <int>[];

  @override
  bool get isReady => true;

  @override
  Future<void> goToPage({
    required int pageNumber,
    PdfPageAnchor? anchor,
    Duration duration = const Duration(milliseconds: 200),
  }) async => wentTo.add(pageNumber);
}

void main() {
  late _Pdfium pdfium;
  final MemoryByteReader pdf = MemoryByteReader(Uint8List.fromList('%PDF-1.7'.codeUnits));

  setUp(() {
    pdfium = _Pdfium();
    PdfrxEntryFunctions.instance = pdfium;
  });

  test('opens the document from the bytes the reader reads, and counts its pages', () async {
    final PdfOpening opening = await const PdfrxEngine().open(pdf, name: 'report.pdf');

    final PdfHandle handle = (opening as PdfOpened).handle;
    expect(handle.pageCount, 3);
    expect(pdfium.read, '%PDF'.codeUnits);
    expect(pdfium.sourceName, 'report.pdf');
    await handle.close();
  });

  test('S-48 · bytes the server did not read as a PDF never reach the engine', () async {
    final PdfOpening opening = await const PdfrxEngine().open(
      MemoryByteReader(Uint8List(4), contentType: 'text/plain'),
      name: 'fake.pdf',
    );

    expect(opening, isA<PdfNotPdf>());
    expect(pdfium.read, isNull);
  });

  test('S-108 · a document PDFium cannot read is broken', () async {
    pdfium.broken = true;

    expect(await const PdfrxEngine().open(pdf, name: 'x.pdf'), isA<PdfBroken>());
  });

  test('S-115, S-116 · locked: asks; a wrong password is wrong; the right one opens', () async {
    pdfium.lockedWith = 'spike';

    expect(await const PdfrxEngine().open(pdf, name: 'x.pdf'), isA<PdfLocked>());
    expect(
      await const PdfrxEngine().open(pdf, name: 'x.pdf', password: 'nope'),
      isA<PdfWrongPassword>(),
    );
    expect(await const PdfrxEngine().open(pdf, name: 'x.pdf', password: 'spike'), isA<PdfOpened>());
  });

  test(
    'S-109 · the viewer draws no forms; links come back to the app, a page link stays in it',
    () async {
      final PdfrxHandle handle =
          (await const PdfrxEngine().open(pdf, name: 'x.pdf') as PdfOpened).handle as PdfrxHandle;
      final List<int> pages = <int>[];
      final List<String> links = <String>[];
      final Widget view = handle.view(PdfHooks(onPage: pages.add, onLink: links.add));

      final PdfViewerParams params = (view as PdfViewer).params;
      expect(params.annotationRenderingMode, PdfAnnotationRenderingMode.annotation);
      // S-112 · the pinch, the double tap and the free drag are the engine's own, and left on.
      expect(params.scaleEnabled, isTrue);
      expect(params.panEnabled, isTrue);
      expect(params.panAxis, PanAxis.free);

      params.onPageChanged!(4);
      params.onPageChanged!(null);
      params.linkHandlerParams!.onLinkTap(
        PdfLink(const <PdfRect>[], url: Uri.parse('https://example.com/a')),
      );
      params.linkHandlerParams!.onLinkTap(
        const PdfLink(<PdfRect>[], dest: PdfDest(2, PdfDestCommand.xyz, null)),
      );
      params.linkHandlerParams!.onLinkTap(const PdfLink(<PdfRect>[]));
      handle.goToPage(2);

      expect(pages, <int>[4, 1]);
      expect(links, <String>['https://example.com/a']);
    },
  );

  test('a viewer on screen goes to the page; one not laid out yet ignores it', () async {
    final _ReadyController controller = _ReadyController();
    final PdfrxHandle handle = PdfrxHandle(_Document('x.pdf'), controller: controller);

    handle.goToPage(3);
    PdfrxHandle(_Document('x.pdf')).goToPage(3);

    expect(controller.wentTo, <int>[3]);
  });

  test('closing the handle disposes the document', () async {
    final PdfHandle handle =
        (await const PdfrxEngine().open(pdf, name: 'x.pdf') as PdfOpened).handle;

    await handle.close();
  });
}
