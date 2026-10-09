/// Downloading a file — the entries, the strip and the sentence of the end (plan 25, B-28).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/files.dart';
import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/fake_file_saver.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/fakes/fake_pdf_engine.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';

const String folder = '/home/someone/project';

void main() {
  late AppLocalizations l10n;
  late FakeFilesRepository files;
  late RecordingFileSaver saver;
  late MemoryTemporaryFiles temporary;
  late FakePdfEngine pdf;
  late AppLogger logger;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    files = FakeFilesRepository()
      ..levels[''] = <FileEntry>[
        aFolder('docs'),
        aFile('README.md', size: 12000),
        aFile('huge.iso', size: testLimits.downloadMaxBytes + 1),
        aLink('outside-link', outside: true),
      ]
      ..texts['notes.txt'] = const TextDocument(
        path: 'notes.txt',
        content: 'one\n',
        etag: '"v1"',
        size: 4,
      );
    saver = RecordingFileSaver();
    temporary = MemoryTemporaryFiles();
    pdf = FakePdfEngine(opening: const PdfBroken());
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
    addTearDown(logger.dispose);
  });

  List<Override> overrides() => <Override>[
    filesRepositoryProvider.overrideWithValue(files),
    fileSaverProvider.overrideWithValue(saver),
    temporaryFilesProvider.overrideWithValue(temporary),
    credentialStoreProvider.overrideWithValue(FakeCredentialStore()),
    pdfEngineProvider.overrideWithValue(pdf),
    appLoggerProvider.overrideWithValue(logger),
  ];

  Future<void> pumpPanel(WidgetTester tester) async {
    await tester.pumpApp(
      AppScreen(
        title: 'Host',
        endDrawer: const FilesPanel(folder: folder),
        actions: <Widget>[FilesPanel.button()],
        body: const Text('the screen'),
      ),
      overrides: overrides(),
    );
    await tester.tap(find.byTooltip(l10n.filesPanelOpen));
    await tester.pumpAndSettle();
  }

  Future<void> pumpViewer(WidgetTester tester, String path) async {
    await tester.pumpRouted(<RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState _) => Scaffold(
          body: TextButton(
            onPressed: () => unawaited(context.push<void>(viewerRouteFor(folder, path))),
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
    ], overrides: overrides());
    await tester.tap(find.text('home'));
    await tester.pumpAndSettle();
  }

  Finder inPanel(Finder finder) => find.descendant(of: find.byType(FilesPanel), matching: finder);

  Future<void> holdOn(WidgetTester tester, String name) async {
    await tester.longPress(inPanel(find.text(name)));
    await tester.pumpAndSettle();
  }

  Map<CustomSemanticsAction, VoidCallback> actionsOf(WidgetTester tester, String name) => tester
      .widget<Semantics>(
        find
            .ancestor(
              of: inPanel(find.text(name)),
              matching: find.byWidgetPredicate(
                (Widget widget) =>
                    widget is Semantics && widget.properties.customSemanticsActions != null,
              ),
            )
            .first,
      )
      .properties
      .customSemanticsActions!;

  group('the panel', () {
    testWidgets('S-132 · pressing and holding a file offers "download"; saved, it says so', (
      WidgetTester tester,
    ) async {
      await pumpPanel(tester);
      await holdOn(tester, 'README.md');

      await tester.tap(find.text(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(files.downloads.single.path, 'README.md');
      expect(saver.offered.single.name, 'README.md');
      expect(temporary.deleted, temporary.created);
      expect(find.text(l10n.filesDownloaded('README.md')), findsOneWidget);
    });

    testWidgets('S-132 · the same is a Semantics action of the row', (WidgetTester tester) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pumpPanel(tester);

      final Map<CustomSemanticsAction, VoidCallback> actions = actionsOf(tester, 'README.md');
      actions.entries
          .singleWhere(
            (MapEntry<CustomSemanticsAction, VoidCallback> each) =>
                each.key.label == l10n.filesDownload,
          )
          .value();
      await tester.pumpAndSettle();

      expect(saver.offered.single.name, 'README.md');
      semantics.dispose();
    });

    testWidgets('S-134 · a folder, and a link that does not open, have no "download"', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pumpPanel(tester);

      for (final String name in <String>['docs', 'outside-link']) {
        expect(
          actionsOf(tester, name).keys.map((CustomSemanticsAction each) => each.label),
          isNot(contains(l10n.filesDownload)),
          reason: name,
        );
        await holdOn(tester, name);
        expect(find.text(l10n.filesDownload), findsNothing, reason: name);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
      }
      semantics.dispose();
    });

    testWidgets('S-127 · a file past the ceiling is refused before anything is asked', (
      WidgetTester tester,
    ) async {
      await pumpPanel(tester);
      await holdOn(tester, 'huge.iso');

      await tester.tap(find.text(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(files.downloads, isEmpty);
      expect(
        find.text(
          l10n.filesDownloadTooLarge('huge.iso', formatBytes(testLimits.downloadMaxBytes, 'en')),
        ),
        findsOneWidget,
      );
      expect(find.widgetWithText(SnackBarAction, l10n.commonActionRetry), findsNothing);
    });

    testWidgets('S-133 · on its way, a strip says it with a bar and "cancel", announced', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      files.downloadGate = Completer<void>();
      await pumpPanel(tester);
      await holdOn(tester, 'README.md');
      await tester.tap(find.text(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(find.text(l10n.filesDownloading('README.md')), findsOneWidget);
      expect(
        tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value,
        0.5,
      );
      expect(
        tester.getSemantics(find.text(l10n.filesDownloading('README.md'))),
        isSemantics(isLiveRegion: true),
      );

      await tester.tap(find.byTooltip(l10n.filesDownloadCancel));
      await tester.pumpAndSettle();

      expect(find.text(l10n.filesDownloading('README.md')), findsNothing);
      expect(saver.offered, isEmpty);
      expect(find.byType(SnackBar), findsNothing, reason: 'a cancel is not an error (S-124)');
      semantics.dispose();
    });
  });

  group('the viewer', () {
    testWidgets('S-131 · "download" is on the bar, with the size the text said', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');

      await tester.tap(find.byTooltip(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(saver.offered.single.name, 'notes.txt');
      expect(find.text(l10n.filesDownloaded('notes.txt')), findsOneWidget);
    });

    final Map<String, Failure> refusals = <String, Failure>{
      'S-69 · no preview': const ServerFailure(
        code: 'FILE_NOT_TEXT',
        messageKey: 'files.error.notText',
        traceId: 't',
      ),
      'S-70 · encoding': const ServerFailure(
        code: 'FILE_NOT_TEXT',
        messageKey: 'files.error.notText',
        traceId: 't',
        params: <String, String>{'reason': 'encoding'},
      ),
      'S-71, S-62 · too large': const ServerFailure(
        code: 'FILE_TOO_LARGE',
        messageKey: 'files.error.tooLarge',
        traceId: 't',
        params: <String, String>{'size': '99999999', 'limit': '10485760'},
      ),
    };
    refusals.forEach((String name, Failure failure) {
      testWidgets('$name offers "download"', (WidgetTester tester) async {
        files.failures['a.bin'] = failure;
        await pumpViewer(tester, 'a.bin');

        await tester.tap(find.widgetWithText(TextButton, l10n.filesDownload));
        await tester.pumpAndSettle();

        expect(saver.offered.single.name, 'a.bin');
      });
    });

    testWidgets('a file that is gone offers no "download" in its state', (
      WidgetTester tester,
    ) async {
      files.failures['gone.txt'] = const ServerFailure(
        code: 'FILE_NOT_FOUND',
        messageKey: 'files.error.notFound',
        traceId: 't',
      );
      await pumpViewer(tester, 'gone.txt');

      expect(find.widgetWithText(TextButton, l10n.filesDownload), findsNothing);
    });

    testWidgets('S-108 · a corrupt PDF says so, with "download"', (WidgetTester tester) async {
      await pumpViewer(tester, 'report.pdf');

      expect(find.text(l10n.pdfCorrupt), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(saver.offered.single.name, 'report.pdf');
    });

    testWidgets('S-117 · protected, cancelled: "enter the password" and "download"', (
      WidgetTester tester,
    ) async {
      pdf.opening = const PdfLocked();
      await pumpViewer(tester, 'locked.pdf');
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.pdfEnterPassword), findsOneWidget);
      expect(find.widgetWithText(TextButton, l10n.filesDownload), findsOneWidget);
    });

    testWidgets('a .pdf or an image the server read as something else offers "download"', (
      WidgetTester tester,
    ) async {
      pdf.opening = const PdfNotPdf();
      files.raws['fake.png'] = const RawFile(bytes: <int>[0], contentType: 'text/plain');

      for (final String path in <String>['fake.pdf', 'fake.png']) {
        await pumpViewer(tester, path);
        expect(find.widgetWithText(TextButton, l10n.filesDownload), findsOneWidget, reason: path);
      }
    });
  });

  group('the end', () {
    testWidgets('S-125 · refused on the way: why, with "try again", which downloads again', (
      WidgetTester tester,
    ) async {
      files.downloadFailure = const NetworkFailure(traceId: 't');
      await pumpViewer(tester, 'notes.txt');

      await tester.tap(find.byTooltip(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(find.textContaining(l10n.filesDownloadRefused('notes.txt', '')), findsOneWidget);
      files.downloadFailure = null;
      await tester.tap(find.widgetWithText(SnackBarAction, l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(files.downloads, hasLength(2));
      expect(saver.offered.single.name, 'notes.txt');
    });

    testWidgets('the server refusing it as too large says the ceiling; gone, no "try again"', (
      WidgetTester tester,
    ) async {
      files.downloadFailure = const ServerFailure(
        code: 'FILE_TOO_LARGE',
        messageKey: 'files.error.tooLarge',
        traceId: 't',
        params: <String, String>{'limit': '1024'},
      );
      await pumpViewer(tester, 'notes.txt');
      await tester.tap(find.byTooltip(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(
        find.text(l10n.filesDownloadTooLarge('notes.txt', formatBytes(1024, 'en'))),
        findsOneWidget,
      );

      ScaffoldMessenger.of(tester.element(find.byType(FileViewerPage))).clearSnackBars();
      files.downloadFailure = const ServerFailure(
        code: 'FILE_NOT_FOUND',
        messageKey: 'files.error.notFound',
        traceId: 't',
      );
      await tester.tap(find.byTooltip(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(SnackBarAction, l10n.commonActionRetry), findsNothing);
    });

    testWidgets('S-121 · the system could not save: said in words, with "try again"', (
      WidgetTester tester,
    ) async {
      saver.outcome = const SaveFailed('SAVE_FAILED: ENOSPC');
      await pumpViewer(tester, 'notes.txt');

      await tester.tap(find.byTooltip(l10n.filesDownload));
      await tester.pumpAndSettle();

      expect(find.text(l10n.filesDownloadNotSaved('notes.txt')), findsOneWidget);
      expect(find.textContaining('ENOSPC'), findsNothing);
      expect(find.widgetWithText(SnackBarAction, l10n.commonActionRetry), findsOneWidget);
    });
  });
}
