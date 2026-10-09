/// One PDF of the folder, open in the viewer (plan 25, B-23…B-25).
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'pdf_controller.g.dart';

/// Where a PDF stands on screen.
class PdfView extends Equatable {
  const PdfView({this.opening, this.failure, this.page = 1});

  /// What opening it ended in — `null` while it opens.
  final PdfOpening? opening;

  /// Why reading it failed before the engine was asked — the server refused, nothing answered.
  final Failure? failure;

  /// The page at the top of the view, counted from 1.
  final int page;

  @override
  List<Object?> get props => <Object?>[opening, failure, page];
}

/// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
/// not into this state, not into a log (S-118).
@riverpod
class PdfDocumentController extends _$PdfDocumentController {
  PdfHandle? _handle;

  @override
  PdfView build(String folder, String path) {
    ref.onDispose(() => unawaited(_handle?.close()));
    unawaited(_open(null));
    return const PdfView();
  }

  /// Opens it again with [password].
  Future<void> unlock(String password) {
    state = const PdfView();
    return _open(password);
  }

  /// Asks again — after a failure of the server or of the network.
  Future<void> retry() {
    state = const PdfView();
    return _open(null);
  }

  /// The page at the top of the view changed.
  void pageChanged(int page) =>
      state = PdfView(opening: state.opening, failure: state.failure, page: page);

  Future<void> _open(String? password) async {
    try {
      final PdfOpening opening = await ref
          .read(pdfEngineProvider)
          .open(ref.read(openFileReaderProvider)(folder, path), name: path, password: password);
      if (!ref.mounted) {
        if (opening is PdfOpened) {
          unawaited(opening.handle.close());
        }
        return;
      }
      if (opening is PdfOpened) {
        _handle = opening.handle;
      }
      state = PdfView(opening: opening);
    } on Object catch (error) {
      if (ref.mounted) {
        state = PdfView(failure: asFailure(error));
      }
    }
  }
}
