/// The engine that shows a PDF (plan 25, B-23).
///
/// A port, because the engine is native code — PDFium, by `pdfrx` (D-06) — that the `flutter test`
/// does not run (R-06). It lives with the screens, and not in `domain/`, because what it hands back
/// is a widget: the document as the person scrolls and zooms it. The tests answer with a fake.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/presentation/engines/pdfrx_engine.dart';

/// What the viewer hears from the document on screen.
class PdfHooks {
  const PdfHooks({required this.onPage, required this.onLink});

  /// The page at the top of the view changed — counted from 1.
  final void Function(int page) onPage;

  /// A link of the document to somewhere else than a page of it was tapped.
  final void Function(String address) onLink;
}

/// One document, open.
abstract interface class PdfHandle {
  int get pageCount;

  /// The document, scrolled page after page, with pinch, double tap and drag.
  Widget view(PdfHooks hooks);

  /// Takes the view to [page], counted from 1.
  void goToPage(int page);

  Future<void> close();
}

/// What opening a PDF ended in.
sealed class PdfOpening {
  const PdfOpening();
}

/// The document, open.
final class PdfOpened extends PdfOpening {
  const PdfOpened(this.handle);

  final PdfHandle handle;
}

/// The document asks for a password, and none was given.
final class PdfLocked extends PdfOpening {
  const PdfLocked();
}

/// The password given is not the document's.
final class PdfWrongPassword extends PdfOpening {
  const PdfWrongPassword();
}

/// The bytes are not a PDF PDFium reads.
final class PdfBroken extends PdfOpening {
  const PdfBroken();
}

/// The server read the bytes as something else than a PDF (S-48): the engine never got them.
final class PdfNotPdf extends PdfOpening {
  const PdfNotPdf();
}

/// Opens a PDF.
abstract interface class PdfEngine {
  /// [reader] read by ranges; [password] when the person typed one. A failure of the reader — the
  /// server refused, nothing answered — reaches the caller as the `Failure` it is.
  Future<PdfOpening> open(ByteReader reader, {required String name, String? password});
}

/// The engine of the app: PDFium, by `pdfrx`.
final Provider<PdfEngine> pdfEngineProvider = Provider<PdfEngine>((Ref ref) => const PdfrxEngine());
