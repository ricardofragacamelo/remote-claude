/// A PDF engine a test drives (plan 25, B-23).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';

/// A document of [pageCount] pages, drawn as buttons the test taps: a page reached, a link tapped.
class FakePdfHandle implements PdfHandle {
  FakePdfHandle({this.pageCount = 12, this.link = 'https://example.com/doc'});

  @override
  final int pageCount;

  /// The link the document's "link" button follows.
  final String link;

  /// Every page the viewer was sent to.
  final List<int> wentTo = <int>[];

  bool closed = false;

  @override
  Widget view(PdfHooks hooks) => Column(
    children: <Widget>[
      Text('the document, $pageCount pages'),
      TextButton(onPressed: () => hooks.onPage(7), child: const Text('scroll to page 7')),
      TextButton(onPressed: () => hooks.onLink(link), child: const Text('tap the link')),
    ],
  );

  @override
  void goToPage(int page) => wentTo.add(page);

  @override
  Future<void> close() async => closed = true;
}

/// Opens as the test says, for each password, and records what it was given.
class FakePdfEngine implements PdfEngine {
  FakePdfEngine({PdfOpening? opening}) : opening = opening ?? PdfOpened(FakePdfHandle());

  /// What opening without a password answers.
  PdfOpening opening;

  /// What a password answers — a password not here is a wrong one.
  final Map<String, PdfOpening> passwords = <String, PdfOpening>{};

  /// Every password tried, in order — `null` for none.
  final List<String?> tried = <String?>[];

  /// What reading the first bytes throws, when the test wants the server to refuse.
  Object? failure;

  /// Held open until the test completes it — a document still opening.
  Completer<void>? opened;

  @override
  Future<PdfOpening> open(ByteReader reader, {required String name, String? password}) async {
    tried.add(password);
    await opened?.future;
    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    if (password == null) {
      return opening;
    }
    return passwords[password] ?? const PdfWrongPassword();
  }
}
