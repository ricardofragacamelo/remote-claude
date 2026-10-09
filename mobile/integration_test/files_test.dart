/// Plan 25, F7 — the file browser on the emulator, against the real stack (B-29, B-30).
///
/// A folder of its own per test, filled through the browser's door (`/files/upload`, D-21) with
/// what each viewer reads; the phone reads it through the panel, from a session and from the
/// folder's screen, with the real engines — PDFium for the PDF, the WebView's Mermaid for the
/// diagrams. The "save as" is the only edge played by the test (D-16): the download is the real
/// one, over HTTP, and the trail records it.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/markdown_viewer.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/text_viewer.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';

import 'fixtures/folder_fixture.dart';
import 'support/e2e_environment.dart';
import 'support/files_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario scenario = E2eScenario.named('mobile-files');
  final BuildConfig config = e2eConfig();

  /// S-135 · the fixture folder of the test, made inside the first root and removed once it is over.
  Future<({String folder, Map<String, Uint8List> files})> theFixtureFolder(SignedInApp app) async {
    final String root = await app.browser.firstWorkspace();
    final String name = 'e2e-app-files-${DateTime.now().microsecondsSinceEpoch}';
    final String folder = await app.browser.makeFolder(root, name);
    addTearDown(() async {
      await app.browser.closeFolder(folder);
      await app.browser.removeFolder(root, name);
    });
    final Map<String, Uint8List> files = await fixtureFiles();
    await app.browser.upload(folder, files);

    return (folder: folder, files: files);
  }

  /// The browser opens a session in [folder], and the phone goes to it — attached, watching.
  Future<(BrowserSocket, String)> aSessionIn(
    WidgetTester tester,
    SignedInApp app,
    String folder,
  ) async {
    final (BrowserSocket browser, List<String> opened) = await aBrowserOf(config, app);
    final String sessionId = await browser.start(folder);
    opened.add(sessionId);
    app.container.read(routerProvider).go(sessionRouteFor(sessionId));
    await pumpUntil(tester, () => find.byType(SessionPage).hitTestable().evaluate().isNotEmpty);

    return (browser, sessionId);
  }

  testWidgets(
    '${scenario.id} — S-153, S-135, S-141: a phone still pending is told to approve it; approved '
    'in the browser, the folder screen\'s panel lists the fixture and opens a file',
    (WidgetTester tester) async {
      final SignedInApp app = await signedInApp(tester, config, scenario);
      final FilesRobot files = FilesRobot(tester, app.l10n);
      final ({String folder, Map<String, Uint8List> files}) fixture = await theFixtureFolder(app);

      app.container.read(routerProvider).go(folderRouteFor(fixture.folder));
      await pumpUntil(tester, () => find.byType(FolderPage).hitTestable().evaluate().isNotEmpty);
      await files.openPanel();

      // S-153: the token of the real Keycloak is not the web's, so the phone must be approved.
      await pumpUntil(
        tester,
        () => files.inPanel(find.text(app.l10n.filesPanelDevicePending)).evaluate().isNotEmpty,
      );
      await approvedFromTheBrowser(tester, app);
      await tester.tap(files.inPanel(find.text(app.l10n.commonActionRetry)));

      // S-135: the fixture, the hidden name only with "show hidden".
      for (final String name in <String>[
        'docs',
        'notes.md',
        'one-page.pdf',
        'long.pdf',
        'square.png',
        'blob.bin',
      ]) {
        await files.sees(name);
      }
      expect(files.inPanel(find.text('Thumbs.db')), findsNothing);
      await files.panelMenu(app.l10n.filesPanelShowHidden);
      await files.sees('Thumbs.db');

      // S-141: the folder screen's panel opens a file, with no session anywhere.
      await files.tapEntry('docs');
      await files.openFile('readme.txt');
      await files.seesInViewer(find.textContaining('The readme of the docs.'));
      await files.back();
      expect(find.byType(FolderPage).hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    '${scenario.id} — S-136, S-137, S-114, S-100, S-140: from a session, every kind in its own '
    'viewer, the real engines drawing, and a download that reaches the "save as" whole',
    (WidgetTester tester) async {
      final KeepingSaver saver = KeepingSaver();
      final SignedInApp app = await anApprovedApp(
        tester,
        config,
        scenario,
        overrides: <Override>[fileSaverProvider.overrideWithValue(saver)],
      );
      final FilesRobot files = FilesRobot(tester, app.l10n);
      final ({String folder, Map<String, Uint8List> files}) fixture = await theFixtureFolder(app);
      await aSessionIn(tester, app, fixture.folder);
      final String name = fixture.folder.split('/').last;

      // S-136: two levels down, and back by the breadcrumb.
      await files.openPanel();
      await files.tapEntry('docs');
      await files.tapEntry('deep');
      await files.sees('long.txt');
      await files.crumb(name);
      await files.sees('notes.md');

      // S-136, S-137: the long text, wrapped and then not.
      await files.tapEntry('docs');
      await files.tapEntry('deep');
      await files.openFile('long.txt');
      await files.seesInViewer(find.byType(TextViewer));
      final bool wrapped = tester.widget<TextViewer>(find.byType(TextViewer)).wrap;
      await files.viewerMenu(app.l10n.fileViewerWrap);
      await pumpUntil(
        tester,
        () => tester.widget<TextViewer>(find.byType(TextViewer)).wrap != wrapped,
      );
      await files.viewerMenu(app.l10n.fileViewerWrap);
      await files.back();

      // S-137, S-100: the preview, every diagram drawn by the real engine and the broken one said;
      // the one with a `click` directive drawn as a picture, which opens full screen, nowhere else.
      await files.crumb(name);
      await files.openFile('notes.md');
      await files.seesInViewer(find.byType(MarkdownViewer));
      final ({Set<String> drawn, bool brokenSaid}) seen = await files.diagramsOnTheWay(
        diagrams.length,
      );
      expect(seen.drawn, containsAll(diagrams.values.map((String code) => code.trim())));
      expect(seen.brokenSaid, isTrue);
      await tester.tap(find.byTooltip(app.l10n.markdownSource));
      await files.seesInViewer(find.byType(TextViewer));
      await tester.tap(find.byTooltip(app.l10n.markdownPreview));
      await files.seesInViewer(find.byType(MarkdownViewer));
      await files.back();

      // S-136, S-114: PDFium, one page and five hundred, with "go to page".
      await files.openFile('one-page.pdf');
      await files.seesInViewer(find.text(app.l10n.pdfPageOf(1, 1)));
      await files.back();
      await files.openFile('long.pdf');
      await files.seesInViewer(find.text(app.l10n.pdfPageOf(1, longPdfPages)));
      await tester.tap(find.widgetWithText(TextButton, app.l10n.pdfGoTo));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.enterText(find.byType(TextField), '250');
      await tester.tap(find.widgetWithText(FilledButton, app.l10n.pdfGoTo));
      await files.seesInViewer(find.text(app.l10n.pdfPageOf(250, longPdfPages)));
      await files.back();

      // S-136: the image, zoomable.
      await files.openFile('square.png');
      await files.seesInViewer(find.byType(InteractiveViewer));
      await files.back();

      // S-136, S-140: the binary has no preview, and downloads whole; the trail says so.
      final DateTime before = DateTime.now().toUtc();
      await files.openFile('blob.bin');
      await files.seesInViewer(find.text(app.l10n.fileViewerNoPreview));
      await tester.tap(find.widgetWithText(TextButton, app.l10n.filesDownload));
      await pumpUntil(
        tester,
        () => find.text(app.l10n.filesDownloaded('blob.bin')).evaluate().isNotEmpty,
      );
      expect(saver.saved['blob.bin'], fixture.files['blob.bin']);
      final List<Map<String, Object?>> trail = await app.browser.downloads();
      expect(
        trail.where(
          (Map<String, Object?> event) =>
              event['subjectLabel'] == 'blob.bin' &&
              DateTime.parse(
                event['at']! as String,
              ).isAfter(before.subtract(const Duration(minutes: 1))),
        ),
        hasLength(1),
        reason: 'one download, one fact in the trail — however it reached the phone',
      );
    },
  );

  testWidgets(
    '${scenario.id} — S-138, S-139: the session goes on under the viewer, and a question asked '
    'while a file is open is one tap away',
    (WidgetTester tester) async {
      final SignedInApp app = await anApprovedApp(tester, config, scenario);
      final FilesRobot files = FilesRobot(tester, app.l10n);
      final ({String folder, Map<String, Uint8List> files}) fixture = await theFixtureFolder(app);
      final (BrowserSocket browser, String sessionId) = await aSessionIn(
        tester,
        app,
        fixture.folder,
      );

      // S-138: a turn runs while the phone reads a file; back, the answer is there.
      await files.openFile('notes.md');
      await browser.turn(sessionId, scenario.text('fixture'));
      await files.back();
      // The turn ended on the server before the viewer left; its last frames reach the phone's
      // socket within a moment.
      await tester.pump(const Duration(seconds: 2));
      await app.robot(tester).seeInConversation(find.text(scenario.text('answer')));

      // S-139: a question arrives with the viewer open: the strip says so, and "back to the session"
      // lands on its card.
      await files.openFile('notes.md');
      final int mark = browser.frames.length;
      browser.prompt(sessionId, scenario.text('askingFixture'));
      await pumpUntil(
        tester,
        () => find.text(app.l10n.fileViewerClaudeWaiting(1)).evaluate().isNotEmpty,
      );
      await tester.tap(find.text(app.l10n.fileViewerBackToSession));
      await pumpUntil(tester, () => files.viewer.evaluate().isEmpty);
      await app.robot(tester).cardOnScreen();
      await browser.waitFor(
        (Map<String, Object?> frame) => frame['type'] == 'turn.completed',
        from: mark,
        timeout: const Duration(seconds: 60),
      );
    },
  );
}
