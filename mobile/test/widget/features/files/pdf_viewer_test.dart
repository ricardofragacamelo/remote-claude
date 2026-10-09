/// A PDF of the folder in the viewer — plan 25, B-23…B-25.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/fakes/fake_pdf_engine.dart';
import '../../../support/pump_app.dart';

class _RecordingLauncher extends Fake
    with MockPlatformInterfaceMixin
    implements UrlLauncherPlatform {
  final List<String> launched = <String>[];

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    launched.add(url);
    return true;
  }
}

void main() {
  late AppLocalizations l10n;
  late FakePdfEngine engine;
  late FakePdfHandle handle;
  late _RecordingLauncher launcher;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    handle = FakePdfHandle();
    engine = FakePdfEngine(opening: PdfOpened(handle));
    launcher = _RecordingLauncher();
    UrlLauncherPlatform.instance = launcher;
  });

  Future<void> pumpPdf(WidgetTester tester) async {
    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState _) => Scaffold(
            body: TextButton(
              onPressed: () =>
                  unawaited(context.push<void>(viewerRouteFor('/w', 'docs/report.pdf'))),
              child: const Text('home'),
            ),
          ),
        ),
        GoRoute(
          path: fileViewerRoute,
          builder: (BuildContext _, GoRouterState state) => FileViewerPage(
            folder: state.uri.queryParameters[viewerFolderParameter] ?? '',
            path: state.uri.queryParameters[viewerPathParameter] ?? '',
          ),
        ),
      ],
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(FakeFilesRepository()),
        credentialStoreProvider.overrideWithValue(FakeCredentialStore()),
        pdfEngineProvider.overrideWithValue(engine),
      ],
    );
    await tester.tap(find.text('home'));
    await tester.pumpAndSettle();
  }

  testWidgets('S-110 · "page N of M" follows the scroll', (WidgetTester tester) async {
    await pumpPdf(tester);
    expect(find.text('the document, 12 pages'), findsOneWidget);
    expect(find.text(l10n.pdfPageOf(1, 12)), findsOneWidget);

    await tester.tap(find.text('scroll to page 7'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.pdfPageOf(7, 12)), findsOneWidget);
  });

  testWidgets('S-111 · "go to page" takes 1 and M, and refuses 0, M+1 and text', (
    WidgetTester tester,
  ) async {
    await pumpPdf(tester);

    Future<void> open() async {
      await tester.tap(find.widgetWithText(TextButton, l10n.pdfGoTo));
      await tester.pumpAndSettle();
    }

    Future<void> submit(String typed) async {
      await tester.enterText(find.byType(TextField), typed);
      await tester.tap(find.widgetWithText(FilledButton, l10n.pdfGoTo));
      await tester.pumpAndSettle();
    }

    await open();
    for (final String wrong in <String>['0', '13', 'two']) {
      await submit(wrong);
      expect(find.text(l10n.pdfGoToInvalid(12)), findsOneWidget, reason: wrong);
    }
    await submit('12');
    expect(find.byType(AlertDialog), findsNothing);

    await open();
    await submit('1');
    expect(handle.wentTo, <int>[12, 1]);

    await open();
    await tester.enterText(find.byType(TextField), '5');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(handle.wentTo, <int>[12, 1, 5]);

    await open();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(handle.wentTo, <int>[12, 1, 5]);
  });

  testWidgets('S-113 · a link of the PDF asks before leaving, like a link of a markdown', (
    WidgetTester tester,
  ) async {
    await pumpPdf(tester);

    await tester.tap(find.text('tap the link'));
    await tester.pumpAndSettle();
    expect(find.text('https://example.com/doc'), findsOneWidget);
    await tester.tap(find.text(l10n.markdownLinkOpen));
    await tester.pumpAndSettle();

    expect(launcher.launched, <String>['https://example.com/doc']);
  });

  testWidgets('S-113 · a javascript: link of the PDF does not open', (WidgetTester tester) async {
    handle = FakePdfHandle(link: 'javascript:alert(1)');
    engine.opening = PdfOpened(handle);
    await pumpPdf(tester);

    await tester.tap(find.text('tap the link'));
    await tester.pump();

    expect(find.text(l10n.markdownLinkRefused), findsOneWidget);
    expect(launcher.launched, isEmpty);
  });

  testWidgets(
    'S-112 · the zoom is the engine\'s: the document is its widget, and the viewer adds no transform',
    (WidgetTester tester) async {
      await pumpPdf(tester);

      expect(find.text('the document, 12 pages'), findsOneWidget);
      expect(find.byType(InteractiveViewer), findsNothing);
    },
  );

  testWidgets('S-115 · a PDF with a password asks for it in a sheet; the right one opens', (
    WidgetTester tester,
  ) async {
    engine
      ..opening = const PdfLocked()
      ..passwords['spike'] = PdfOpened(handle);
    await pumpPdf(tester);

    expect(find.text(l10n.pdfPasswordTitle), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'spike');
    await tester.tap(find.text(l10n.pdfUnlock));
    await tester.pumpAndSettle();

    expect(find.text('the document, 12 pages'), findsOneWidget);
  });

  testWidgets('S-116 · a wrong password says so, and asks again', (WidgetTester tester) async {
    engine
      ..opening = const PdfLocked()
      ..passwords['spike'] = PdfOpened(handle);
    await pumpPdf(tester);

    await tester.enterText(find.byType(TextField), 'nope');
    await tester.tap(find.text(l10n.pdfUnlock));
    await tester.pumpAndSettle();

    expect(find.text(l10n.pdfPasswordWrong), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'spike');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.text('the document, 12 pages'), findsOneWidget);
  });

  testWidgets('S-117 · cancelled, the viewer says it is protected, and offers the sheet again', (
    WidgetTester tester,
  ) async {
    engine.opening = const PdfLocked();
    await pumpPdf(tester);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.pdfProtected), findsOneWidget);
    await tester.tap(find.text(l10n.pdfEnterPassword));
    await tester.pumpAndSettle();
    expect(find.text(l10n.pdfPasswordTitle), findsOneWidget);
  });

  testWidgets('S-108 · a corrupt PDF says so', (WidgetTester tester) async {
    engine.opening = const PdfBroken();
    await pumpPdf(tester);

    expect(find.text(l10n.pdfCorrupt), findsOneWidget);
  });

  testWidgets('S-48 · a .pdf the server did not read as a PDF has no preview', (
    WidgetTester tester,
  ) async {
    engine.opening = const PdfNotPdf();
    await pumpPdf(tester);

    expect(find.text(l10n.fileViewerNoPreview), findsOneWidget);
  });

  testWidgets('a refusal of the server says so; "try again" opens it', (WidgetTester tester) async {
    engine.failure = const NetworkFailure(traceId: 't');
    await pumpPdf(tester);
    expect(find.text(l10n.commonErrorOffline), findsOneWidget);

    engine.failure = null;
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();
    expect(find.text('the document, 12 pages'), findsOneWidget);
  });
}
