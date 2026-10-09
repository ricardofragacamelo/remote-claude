/// [PdfEngine] over `pdfrx` — PDFium (plan 25, B-23, D-06, D-22).
///
/// The bytes come by range, through the app's own client ([ByteReader]); the document is shown by
/// `pdfrx`'s viewer, which brings the continuous scroll, the pinch, the double tap and the drag.
/// Forms are not drawn, and PDFium runs no JavaScript: what the viewer shows is the page, inert.
/// A link of the document goes back to the app, which follows it by the rule of every link of a
/// file — or, when it points at a page of the document, the viewer goes there.
library;

import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/domain/services/viewer_for.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';

/// The engine.
class PdfrxEngine implements PdfEngine {
  const PdfrxEngine();

  @override
  Future<PdfOpening> open(ByteReader reader, {required String name, String? password}) async {
    final ByteProbe probe = await reader.probe();
    if (!confirms(ViewerKind.pdf, probe.contentType)) {
      return const PdfNotPdf();
    }

    try {
      final PdfDocument document = await PdfDocument.openCustom(
        fileSize: probe.size,
        sourceName: name,
        read: (Uint8List buffer, int position, int size) async {
          final Uint8List bytes = await reader.read(position, size);
          buffer.setRange(0, bytes.length, bytes);
          return bytes.length;
        },
        // No password typed: the empty one is tried, and a locked document says so.
        passwordProvider: password == null ? null : () => password,
        firstAttemptByEmptyPassword: password == null,
      );
      return PdfOpened(PdfrxHandle(document));
    } on PdfPasswordException {
      return password == null ? const PdfLocked() : const PdfWrongPassword();
    } on PdfException {
      return const PdfBroken();
    }
  }
}

/// One document open in `pdfrx`.
class PdfrxHandle implements PdfHandle {
  /// [controller] is the viewer's own unless a test brings one.
  PdfrxHandle(this._document, {PdfViewerController? controller})
    : _controller = controller ?? PdfViewerController();

  final PdfDocument _document;
  final PdfViewerController _controller;

  @override
  int get pageCount => _document.pages.length;

  @override
  Widget view(PdfHooks hooks) => PdfViewer(
    PdfDocumentRefDirect(_document, autoDispose: false),
    controller: _controller,
    params: PdfViewerParams(
      annotationRenderingMode: PdfAnnotationRenderingMode.annotation,
      onPageChanged: (int? page) => hooks.onPage(page ?? 1),
      linkHandlerParams: PdfLinkHandlerParams(onLinkTap: (PdfLink link) => _follow(link, hooks)),
    ),
  );

  void _follow(PdfLink link, PdfHooks hooks) {
    final Uri? address = link.url;
    final PdfDest? dest = link.dest;
    if (address != null) {
      hooks.onLink(address.toString());
    } else if (dest != null) {
      goToPage(dest.pageNumber);
    }
  }

  @override
  void goToPage(int page) {
    if (_controller.isReady) {
      _controller.goToPage(pageNumber: page);
    }
  }

  @override
  Future<void> close() => _document.dispose();
}
