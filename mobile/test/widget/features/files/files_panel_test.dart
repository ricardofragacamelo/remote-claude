/// The panel of the folder's files — plan 25, B-10…B-12.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/providers/folder_tree_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/files.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/pump_app.dart';

const String folder = '/home/someone/project';

void main() {
  late AppLocalizations l10n;
  late FakeFilesRepository files;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    files = FakeFilesRepository()
      ..levels[''] = <FileEntry>[
        aFolder('.git', hidden: true),
        aFolder('docs'),
        aFolder('empty'),
        aFile('README.md', size: 12000),
        aLink('outside-link', outside: true),
        aLink('broken-link', target: TargetKind.missing),
      ]
      ..levels['docs'] = <FileEntry>[aFolder('docs/plans'), aFile('docs/a.md')]
      ..levels['docs/plans'] = <FileEntry>[aFile('docs/plans/x.md')];
  });

  Future<void> pumpHost(WidgetTester tester) => tester.pumpApp(
    AppScreen(
      title: 'Host',
      drawer: const Drawer(child: Text('the sessions panel')),
      endDrawer: const FilesPanel(folder: folder),
      actions: <Widget>[
        Builder(
          builder: (BuildContext context) => IconButton(
            tooltip: 'sessions',
            icon: const Icon(Icons.folder_copy_outlined),
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        FilesPanel.button(),
      ],
      body: const Text('the screen'),
    ),
    overrides: <Override>[filesRepositoryProvider.overrideWithValue(files)],
  );

  Future<void> openPanel(WidgetTester tester) async {
    await tester.tap(find.byTooltip(l10n.filesPanelOpen));
    await tester.pumpAndSettle();
  }

  Future<void> closePanel(WidgetTester tester) async {
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
  }

  Finder inPanel(Finder finder) => find.descendant(of: find.byType(FilesPanel), matching: finder);

  ProviderContainer container(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.text('the screen')));

  group('the button and the side — B-10', () {
    testWidgets(
      'S-25 · the button opens the panel on the right; a swipe from either edge opens none',
      (WidgetTester tester) async {
        await pumpHost(tester);
        final double width = tester.getSize(find.byType(Scaffold).last).width;

        await tester.dragFrom(Offset(width - 1, 300), const Offset(-300, 0));
        await tester.pumpAndSettle();
        await tester.dragFrom(const Offset(1, 300), const Offset(300, 0));
        await tester.pumpAndSettle();
        expect(find.byType(FilesPanel), findsNothing);
        expect(find.text('the sessions panel'), findsNothing);

        await openPanel(tester);

        expect(find.byType(FilesPanel), findsOneWidget);
        expect(tester.getTopRight(find.byType(Drawer)).dx, width);
      },
    );

    testWidgets('S-28 · "back" closes the panel first, and the screen stays', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);

      await closePanel(tester);

      expect(find.byType(FilesPanel), findsNothing);
      expect(find.text('the screen'), findsOneWidget);
    });

    testWidgets('S-26 · the two panels, one after the other: each keeps its own state', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();
      await closePanel(tester);

      await tester.tap(find.byTooltip('sessions'));
      await tester.pumpAndSettle();
      expect(find.text('the sessions panel'), findsOneWidget);
      await closePanel(tester);

      await openPanel(tester);
      expect(inPanel(find.text('a.md')), findsOneWidget);
    });

    testWidgets('S-29 · the button has a translated tooltip, a 48 dp target and the guidelines', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pumpHost(tester);

      final Finder button = find.byTooltip(l10n.filesPanelOpen);
      expect(button, findsOneWidget);
      expect(
        find.descendant(of: button, matching: find.byIcon(Icons.account_tree_outlined)),
        findsOneWidget,
      );
      expect(
        tester
            .getSize(
              find.ancestor(
                of: find.byIcon(Icons.account_tree_outlined),
                matching: find.byType(IconButton),
              ),
            )
            .width,
        greaterThanOrEqualTo(48),
      );
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      semantics.dispose();
    });
  });

  group('the panel — B-11', () {
    testWidgets(
      'S-30 · opens at the root, folders first; a folder entered shows in the breadcrumb',
      (WidgetTester tester) async {
        await pumpHost(tester);
        await openPanel(tester);

        final double docs = tester.getTopLeft(inPanel(find.text('docs'))).dy;
        final double readme = tester.getTopLeft(inPanel(find.text('README.md'))).dy;
        expect(docs, lessThan(readme));
        expect(inPanel(find.text('12 kB')), findsOneWidget);

        await tester.tap(inPanel(find.text('docs')));
        await tester.pumpAndSettle();

        expect(inPanel(find.widgetWithText(TextButton, 'project')), findsOneWidget);
        expect(inPanel(find.widgetWithText(TextButton, 'docs')), findsOneWidget);
        expect(inPanel(find.text('a.md')), findsOneWidget);
        expect(files.asked.last, '$folder|docs');
      },
    );

    testWidgets('S-31 · a step of the breadcrumb goes back to its level; the root has no ".."', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      expect(inPanel(find.text('..')), findsNothing);

      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();
      await tester.tap(inPanel(find.text('plans')));
      await tester.pumpAndSettle();
      expect(inPanel(find.text('x.md')), findsOneWidget);

      await tester.tap(inPanel(find.widgetWithText(TextButton, 'project')));
      await tester.pumpAndSettle();

      expect(inPanel(find.text('README.md')), findsOneWidget);
      expect(inPanel(find.text('..')), findsNothing);
    });

    testWidgets('S-32 · ".." goes up one level, and says so to a screen reader', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel(l10n.filesPanelUp), findsOneWidget);
      await tester.tap(inPanel(find.text('..')));
      await tester.pumpAndSettle();

      expect(inPanel(find.text('README.md')), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('S-33 · an empty folder says it is empty', (WidgetTester tester) async {
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('empty')));
      await tester.pumpAndSettle();

      expect(inPanel(find.text(l10n.filesPanelEmpty)), findsOneWidget);
    });

    testWidgets('S-34 · reading, refused with "try again", and the content — each a line', (
      WidgetTester tester,
    ) async {
      files
        ..gate = Completer<void>()
        ..failures[''] = const NetworkFailure(traceId: 't');
      await pumpHost(tester);
      // The bar of a level being read moves for as long as it is read: nothing settles meanwhile.
      await tester.tap(find.byTooltip(l10n.filesPanelOpen));
      await tester.pump(const Duration(milliseconds: 500));
      expect(inPanel(find.text(l10n.filesPanelLoading)), findsOneWidget);

      files.gate!.complete();
      files.gate = null;
      await tester.pumpAndSettle();
      expect(inPanel(find.text(l10n.commonErrorOffline)), findsOneWidget);

      files.failures.clear();
      await tester.tap(inPanel(find.text(l10n.commonActionRetry)));
      await tester.pumpAndSettle();

      expect(inPanel(find.text('README.md')), findsOneWidget);
      expect(inPanel(find.text(l10n.commonErrorOffline)), findsNothing);
    });

    testWidgets('S-35 · a level the server cut says only the first items are shown', (
      WidgetTester tester,
    ) async {
      files.truncated.add('docs');
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();

      expect(inPanel(find.text(l10n.filesPanelTruncated('2'))), findsOneWidget);
    });

    testWidgets('S-36 · a link out and a broken one are marked; a tap opens nothing and says why', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      final int asked = files.asked.length;

      expect(inPanel(find.text(l10n.filesPanelOutsideLink)), findsOneWidget);
      expect(inPanel(find.text(l10n.filesPanelBrokenLink)), findsOneWidget);

      await tester.tap(inPanel(find.text('outside-link')));
      await tester.pump();
      expect(
        find.descendant(of: find.byType(SnackBar), matching: find.text(l10n.filesPanelOutsideLink)),
        findsOneWidget,
      );
      expect(files.asked, hasLength(asked));
    });

    testWidgets('S-37 · "show hidden" in the ⋮ shows and hides them, on the same level', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      expect(inPanel(find.text('.git')), findsNothing);

      Future<void> toggle() async {
        await tester.tap(inPanel(find.byTooltip(l10n.filesPanelMenu)));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.filesPanelShowHidden));
        await tester.pumpAndSettle();
      }

      await toggle();
      expect(inPanel(find.text('.git')), findsOneWidget);
      await toggle();
      expect(inPanel(find.text('.git')), findsNothing);
    });

    testWidgets('S-38 · pulling down reads the level again; so does "refresh" in the ⋮', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      final int asked = files.asked.length;

      await tester.fling(inPanel(find.text('README.md')), const Offset(0, 400), 1000);
      await tester.pumpAndSettle();
      expect(files.asked.length, asked + 1);

      await tester.tap(inPanel(find.byTooltip(l10n.filesPanelMenu)));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.filesPanelRefresh));
      await tester.pumpAndSettle();
      expect(files.asked.length, asked + 2);
    });

    testWidgets('S-39 · closed and opened again: the same level, read again behind it, no blink', (
      WidgetTester tester,
    ) async {
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();
      await closePanel(tester);
      final int asked = files.asked.length;
      files.gate = Completer<void>();

      await openPanel(tester);

      expect(inPanel(find.text('a.md')), findsOneWidget);
      expect(inPanel(find.text(l10n.filesPanelLoading)), findsNothing);
      expect(files.asked.length, asked + 1);
      expect(files.asked.last, '$folder|docs');
      files.gate!.complete();
      await tester.pumpAndSettle();
      expect(inPanel(find.text('a.md')), findsOneWidget);
    });

    testWidgets('S-40 · the folder vanished between listing and entering: "back to the folder"', (
      WidgetTester tester,
    ) async {
      files.failures['docs'] = const ServerFailure(
        code: 'FILE_NOT_FOUND',
        messageKey: 'files.error.notFound',
        traceId: 't',
        params: <String, String>{'path': 'docs'},
      );
      await pumpHost(tester);
      await openPanel(tester);
      await tester.tap(inPanel(find.text('docs')));
      await tester.pumpAndSettle();

      expect(inPanel(find.text(l10n.filesErrorNotFound('docs'))), findsOneWidget);
      await tester.tap(inPanel(find.text(l10n.filesPanelBackToRoot)));
      await tester.pumpAndSettle();

      expect(inPanel(find.text('README.md')), findsOneWidget);
    });

    for (final (String code, String key, bool retry) in <(String, String, bool)>[
      ('DEVICE_NOT_REGISTERED', 'auth.error.deviceNotRegistered', true),
      ('DEVICE_REVOKED', 'auth.error.deviceRevoked', false),
    ]) {
      testWidgets('S-152 · $code says what to do, never the generic error', (
        WidgetTester tester,
      ) async {
        files.failures[''] = ServerFailure(code: code, messageKey: key, traceId: 't');
        await pumpHost(tester);
        await openPanel(tester);

        final String said = code == 'DEVICE_REVOKED'
            ? l10n.filesPanelDeviceRevoked
            : l10n.filesPanelDevicePending;
        expect(inPanel(find.text(said)), findsOneWidget);
        expect(inPanel(find.text(l10n.commonErrorUnexpected)), findsNothing);
        expect(inPanel(find.text(l10n.commonActionRetry)), retry ? findsOneWidget : findsNothing);

        if (retry) {
          // Approved in the browser meanwhile: "try again" shows the tree.
          files.failures.clear();
          await tester.tap(inPanel(find.text(l10n.commonActionRetry)));
          await tester.pumpAndSettle();
          expect(inPanel(find.text('README.md')), findsOneWidget);
        }
      });
    }

    for (final Size size in <Size>[const Size(360, 640), const Size(360, 400)]) {
      testWidgets('S-41 · ${size.width.toInt()}×${size.height.toInt()} at 200 %: '
          'a long name ends in an ellipsis, nothing overflows, the guidelines hold', (
        WidgetTester tester,
      ) async {
        final SemanticsHandle semantics = tester.ensureSemantics();
        tester.view
          ..physicalSize = size
          ..devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        files.levels[''] = <FileEntry>[
          aFile('a-very-long-file-name-that-never-fits-in-the-panel-of-a-phone.md'),
          ...files.levels['']!,
        ];

        await pumpHost(tester);
        await openPanel(tester);

        expect(tester.takeException(), isNull);
        final double width = tester.getSize(find.byType(Drawer)).width;
        expect(width, lessThanOrEqualTo(size.width * 0.85));
        expect(width, lessThanOrEqualTo(400));
        final Text name = tester.widget<Text>(
          inPanel(find.text('a-very-long-file-name-that-never-fits-in-the-panel-of-a-phone.md')),
        );
        expect(name.overflow, TextOverflow.ellipsis);
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        semantics.dispose();
      });
    }

    testWidgets('a wide screen keeps the panel at 400 dp at most', (WidgetTester tester) async {
      tester.view
        ..physicalSize = const Size(1000, 800)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pumpHost(tester);
      await openPanel(tester);

      expect(tester.getSize(find.byType(Drawer)).width, 400);
    });
  });

  group('the actions of an entry — B-12', () {
    List<String> clipboard(WidgetTester tester) {
      final List<String> copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
        MethodCall call,
      ) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map<Object?, Object?>)['text']! as String);
        }
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      return copied;
    }

    testWidgets(
      'S-42 · pressing and holding a file offers to copy its path relative to the folder',
      (WidgetTester tester) async {
        final List<String> copied = clipboard(tester);
        await pumpHost(tester);
        await openPanel(tester);
        await tester.tap(inPanel(find.text('docs')));
        await tester.pumpAndSettle();

        await tester.longPress(inPanel(find.text('a.md')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.filesEntryCopyPath));
        await tester.pumpAndSettle();

        expect(copied, <String>['docs/a.md']);
        expect(find.text(l10n.filesEntryPathCopied), findsOneWidget);
      },
    );

    testWidgets('S-43 · the same action is a Semantics action of the row', (
      WidgetTester tester,
    ) async {
      final List<String> copied = clipboard(tester);
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pumpHost(tester);
      await openPanel(tester);

      final Semantics row = tester.widget<Semantics>(
        find
            .ancestor(
              of: inPanel(find.text('README.md')),
              matching: find.byWidgetPredicate(
                (Widget widget) =>
                    widget is Semantics && widget.properties.customSemanticsActions != null,
              ),
            )
            .first,
      );
      final Map<CustomSemanticsAction, VoidCallback> actions =
          row.properties.customSemanticsActions!;
      expect(actions.keys.map((CustomSemanticsAction action) => action.label), <String>[
        l10n.filesEntryCopyPath,
        l10n.filesDownload,
      ]);

      actions.values.first();
      await tester.pumpAndSettle();
      expect(copied, <String>['README.md']);
      semantics.dispose();
    });
  });

  testWidgets('a tap on a file is handed to whoever opens files', (WidgetTester tester) async {
    final List<String> opened = <String>[];
    await tester.pumpApp(
      AppScreen(
        title: 'Host',
        endDrawer: FilesPanel(
          folder: folder,
          onOpenFile: (FileEntry file) => opened.add(file.path),
        ),
        actions: <Widget>[FilesPanel.button()],
        body: const Text('the screen'),
      ),
      overrides: <Override>[filesRepositoryProvider.overrideWithValue(files)],
    );
    await openPanel(tester);

    await tester.tap(inPanel(find.text('README.md')));
    await tester.pumpAndSettle();

    expect(opened, <String>['README.md']);
  });

  testWidgets('the panel of a folder is its own: the state of another folder is not shown', (
    WidgetTester tester,
  ) async {
    await pumpHost(tester);
    container(tester).read(folderTreeControllerProvider('/other'));
    await openPanel(tester);

    expect(inPanel(find.text('README.md')), findsOneWidget);
  });
}
