/// The file browser of the app, driven as a person does — the panel, the viewers and the download
/// (plan 25, B-30).
///
/// The waits are on what the screen shows, never on time: a level comes over HTTP, a PDF through
/// PDFium, a diagram from the WebView — none of them is an animation `pumpAndSettle` would wait for.
library;

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/markdown_viewer.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/mermaid_block.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'e2e_environment.dart';

/// The system's "save as", played by the test: what it was handed, read before the app deletes it
/// (D-16) — the download itself is the real one, over the real HTTP.
class KeepingSaver implements FileSaver {
  /// Every file offered, by its name, with the bytes it held.
  final Map<String, Uint8List> saved = <String, Uint8List>{};

  @override
  Future<SaveOutcome> save({
    required String temporaryPath,
    required String name,
    required String mimeType,
  }) async {
    saved[name] = await File(temporaryPath).readAsBytes();
    return const Saved();
  }
}

/// The panel and the viewer, by what they say.
class FilesRobot {
  FilesRobot(this.tester, this.l10n);

  final WidgetTester tester;
  final AppLocalizations l10n;

  Finder get panel => find.byType(FilesPanel);

  Finder inPanel(Finder finder) => find.descendant(of: panel, matching: finder);

  Finder get viewer => find.byType(FileViewerPage);

  /// Opens the panel from the bar of the screen on top, when it is not open already.
  Future<void> openPanel() async {
    if (panel.hitTestable().evaluate().isNotEmpty) {
      return;
    }
    final Finder button = find.byTooltip(l10n.filesPanelOpen).hitTestable();
    await pumpUntil(tester, () => button.evaluate().isNotEmpty, what: () => 'the panel button');
    await tester.tap(button.first);
    await pumpUntil(tester, () => panel.hitTestable().evaluate().isNotEmpty);
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Waits for [name] in the level on screen.
  Future<void> sees(String name) => pumpUntil(
    tester,
    () => inPanel(find.text(name)).evaluate().isNotEmpty,
    what: () => '"$name" in the panel',
  );

  /// Taps the entry [name] — a folder enters it, a file opens it. The panel steps aside when a file
  /// opens (D-33), so it is opened again first when it is not on screen.
  Future<void> tapEntry(String name) async {
    await openPanel();
    await sees(name);
    final Finder entry = inPanel(find.text(name));
    await tester.ensureVisible(entry);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(entry);
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// Taps the step [label] of the breadcrumb.
  Future<void> crumb(String label) async {
    await openPanel();
    await tester.tap(inPanel(find.widgetWithText(TextButton, label)));
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// Picks [item] in the panel's `⋮`.
  Future<void> panelMenu(String item) async {
    await tester.tap(inPanel(find.byTooltip(l10n.filesPanelMenu)));
    await tester.pumpAndSettle();
    await tester.tap(_menuItem(item));
    await tester.pumpAndSettle();
  }

  /// Opens the file [name] of the level on screen, and waits for its viewer.
  Future<void> openFile(String name) async {
    await tapEntry(name);
    await pumpUntil(tester, () => viewer.hitTestable().evaluate().isNotEmpty);
  }

  /// Waits for [finder] inside the viewer.
  Future<void> seesInViewer(Finder finder, {Duration timeout = const Duration(seconds: 30)}) =>
      pumpUntil(
        tester,
        () => find.descendant(of: viewer, matching: finder).evaluate().isNotEmpty,
        timeout: timeout,
        what: () => '$finder in the viewer',
      );

  /// Picks [item] in the viewer's `⋯`.
  Future<void> viewerMenu(String item) async {
    await tester.tap(find.byTooltip(l10n.fileViewerMenu));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(_menuItem(item));
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// The item of an open menu that says [label] — the whole row, where a tap lands.
  Finder _menuItem(String label) => find
      .ancestor(
        of: find.text(label).last,
        matching: find.byWidgetPredicate((Widget widget) => widget is PopupMenuEntry<Object?>),
      )
      .first;

  /// "Back", as the system gesture — the viewer leaves, and the screen under it stays as it was.
  Future<void> back() async {
    await tester.binding.handlePopRoute();
    await pumpUntil(tester, () => viewer.evaluate().isEmpty);
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Scrolls the markdown preview to its end, piece by piece, and answers the diagrams drawn on the
  /// way — by their code — and whether the broken one said so. A block is drawn only when it comes
  /// near the view, so each one is waited for where it is.
  Future<({Set<String> drawn, bool brokenSaid})> diagramsOnTheWay(int expected) async {
    final Set<String> drawn = <String>{};
    bool brokenSaid = false;
    final Finder scrollable = find
        .descendant(of: find.byType(MarkdownViewer), matching: find.byType(Scrollable))
        .first;

    for (int step = 0; step < 80 && (drawn.length < expected || !brokenSaid); step++) {
      final DateTime until = DateTime.now().add(const Duration(seconds: 3));
      do {
        await tester.pump(const Duration(milliseconds: 100));
        for (final Element block in find.byType(MermaidBlock).evaluate()) {
          final Finder image = find.descendant(
            of: find.byWidget(block.widget),
            matching: find.byType(Image),
          );
          if (image.evaluate().isNotEmpty) {
            drawn.add((block.widget as MermaidBlock).code);
          }
        }
        brokenSaid = brokenSaid || _brokenSaid();
      } while (DateTime.now().isBefore(until) &&
          find.text(l10n.diagramDrawing).evaluate().isNotEmpty);
      await tester.drag(scrollable, const Offset(0, -350));
    }

    return (drawn: drawn, brokenSaid: brokenSaid);
  }

  /// Whether a diagram on screen says it could not be drawn — with its line, whichever it is.
  bool _brokenSaid() => <String>[
    l10n.diagramInvalid,
    for (int line = 1; line <= 4; line++) l10n.diagramInvalidLine(line),
  ].any((String sentence) => find.text(sentence).evaluate().isNotEmpty);
}
