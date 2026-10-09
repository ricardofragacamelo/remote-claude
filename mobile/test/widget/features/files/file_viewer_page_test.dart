/// The viewer of a file — plan 25, B-14…B-18.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/images.dart';
import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/pump_app.dart';

const String folder = '/home/someone/project';

void main() {
  late AppLocalizations l10n;
  late FakeFilesRepository files;
  late FakePermissionRepository permissions;
  late FakeCredentialStore store;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    files = FakeFilesRepository()
      ..texts['notes.txt'] = const TextDocument(
        path: 'notes.txt',
        content: 'first line\nsecond line\n',
        etag: '"v1"',
      );
    permissions = FakePermissionRepository();
    store = FakeCredentialStore();
  });

  /// The viewer of [path], over a home screen it was pushed from.
  Future<void> pumpViewer(WidgetTester tester, String path, {String? sessionId}) async {
    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState _) => Scaffold(
            body: TextButton(
              onPressed: () =>
                  unawaited(context.push<void>(viewerRouteFor(folder, path, sessionId: sessionId))),
              child: const Text('home'),
            ),
          ),
        ),
        GoRoute(
          path: fileViewerRoute,
          builder: (BuildContext _, GoRouterState state) => FileViewerPage(
            folder: state.uri.queryParameters[viewerFolderParameter] ?? '',
            path: state.uri.queryParameters[viewerPathParameter] ?? '',
            sessionId: state.uri.queryParameters[viewerSessionParameter],
          ),
        ),
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext _, GoRouterState state) => Text('at ${state.uri}'),
        ),
      ],
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(files),
        credentialStoreProvider.overrideWithValue(store),
        ...permissionOverrides(repository: permissions, clock: () => t0),
      ],
    );
    await tester.tap(find.text('home'));
    await tester.pumpAndSettle();
  }

  Future<void> menu(WidgetTester tester, String item) async {
    await tester.tap(find.byTooltip(l10n.fileViewerMenu));
    await tester.pumpAndSettle();
    await tester.tap(find.text(item));
    await tester.pumpAndSettle();
  }

  group('the route and the bar — B-14', () {
    testWidgets('S-53 · the bar says the name, the path under it, and the ⋯', (
      WidgetTester tester,
    ) async {
      files.texts['docs/deep/notes.txt'] = const TextDocument(
        path: 'docs/deep/notes.txt',
        content: 'x',
        etag: '"1"',
      );
      await pumpViewer(tester, 'docs/deep/notes.txt');

      final Finder bar = find.byType(AppBar);
      expect(find.descendant(of: bar, matching: find.text('notes.txt')), findsOneWidget);
      expect(find.descendant(of: bar, matching: find.text('docs/deep/notes.txt')), findsOneWidget);
      expect(find.byTooltip(l10n.fileViewerMenu), findsOneWidget);
    });

    testWidgets('S-53 · a long name ends in an ellipsis at 360 dp and 200 %', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(360, 640)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      const String long = 'a-file-name-much-longer-than-the-bar-of-any-phone.txt';
      files.texts[long] = const TextDocument(path: long, content: 'x', etag: '"1"');

      await pumpViewer(tester, long);

      expect(tester.takeException(), isNull);
      expect(tester.widget<Text>(find.text(long).first).overflow, TextOverflow.ellipsis);
    });

    testWidgets('"back" leaves the viewer for the screen it was opened from', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(find.text('home'), findsOneWidget);
    });
  });

  group('the text — B-15', () {
    testWidgets('S-54 · wrap on: the long line wraps, its number only on its first row', (
      WidgetTester tester,
    ) async {
      files.texts['long.txt'] = TextDocument(
        path: 'long.txt',
        content: '${'w' * 1500}\nend',
        etag: '"1"',
      );
      await pumpViewer(tester, 'long.txt');

      expect(find.text('1'), findsOneWidget);
      expect(find.textContaining('w' * 500, findRichText: true), findsWidgets);
      await tester.drag(find.byType(ListView), const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(find.text('2'), findsOneWidget);
      expect(find.text('3'), findsNothing);
      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
        ),
        findsNothing,
      );
    });

    testWidgets('S-55 · wrap off — chosen in the ⋯ — the text scrolls both ways', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');
      await menu(tester, l10n.fileViewerWrap);

      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
        ),
        findsOneWidget,
      );
      expect(store.values['rc.files.wrap'], 'false');
    });

    testWidgets('S-57 · 50 000 lines: only the rows near the view are built', (
      WidgetTester tester,
    ) async {
      files.texts['huge.txt'] = TextDocument(
        path: 'huge.txt',
        content: List<String>.generate(50000, (int i) => 'line $i').join('\n'),
        etag: '"1"',
      );
      await pumpViewer(tester, 'huge.txt');

      expect(find.textContaining('line ', findRichText: true).evaluate().length, lessThan(200));
      expect(find.text('50000'), findsNothing);
    });

    for (final bool wrap in <bool>[true, false]) {
      testWidgets(
        'S-58 · one line of 1 MB, wrap ${wrap ? 'on' : 'off'}: no row holds the whole line',
        (WidgetTester tester) async {
          if (!wrap) {
            await store.write('rc.files.wrap', 'false');
          }
          files.texts['one.json'] = TextDocument(
            path: 'one.json',
            content: 'j' * (1024 * 1024),
            etag: '"1"',
          );
          await pumpViewer(tester, 'one.json');

          final Iterable<RichText> rows = tester.widgetList<RichText>(find.byType(RichText));
          expect(rows.every((RichText row) => row.text.toPlainText().length <= 10200), isTrue);
          if (!wrap) {
            expect(
              find.textContaining(l10n.fileViewerLineCut('1038576'), findRichText: true),
              findsOneWidget,
            );
          }
        },
      );
    }

    testWidgets('S-59 · a file of zero bytes says it is empty', (WidgetTester tester) async {
      files.texts['empty.txt'] = const TextDocument(path: 'empty.txt', content: '', etag: '"1"');
      await pumpViewer(tester, 'empty.txt');

      expect(find.text(l10n.fileViewerEmpty), findsOneWidget);
    });

    testWidgets('S-60 · "copy all" copies the exact text; what is on screen can be selected', (
      WidgetTester tester,
    ) async {
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
      await pumpViewer(tester, 'notes.txt');

      await menu(tester, l10n.fileViewerCopyAll);

      expect(copied, <String>['first line\nsecond line\n']);
      expect(find.text(l10n.fileViewerCopied), findsOneWidget);
      expect(find.byType(SelectionArea), findsOneWidget);
    });

    testWidgets('S-61 · a large file opens with the strip that says its size', (
      WidgetTester tester,
    ) async {
      files.texts['big.log'] = const TextDocument(
        path: 'big.log',
        content: 'x',
        etag: '"1"',
        size: 2500000,
        largeFile: true,
      );
      await pumpViewer(tester, 'big.log');

      expect(find.text(l10n.fileViewerLarge('2.5 MB')), findsOneWidget);
    });
  });

  group('the pinch — B-16', () {
    Future<double> heightOf(WidgetTester tester, String text) async =>
        tester.getSize(find.textContaining(text, findRichText: true).first).height;

    Future<void> pinch(WidgetTester tester, double from, double to) async {
      final Offset center = tester.getCenter(find.byType(SelectionArea));
      final TestGesture a = await tester.startGesture(center - Offset(from, 0), pointer: 7);
      final TestGesture b = await tester.startGesture(center + Offset(from, 0), pointer: 8);
      await a.moveTo(center - Offset(to, 0));
      await b.moveTo(center + Offset(to, 0));
      await a.up();
      await b.up();
      await tester.pumpAndSettle();
    }

    testWidgets('S-63 · a pinch makes the letters larger, and the rows reflow', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');
      final double before = await heightOf(tester, 'first line');

      await pinch(tester, 40, 80);

      expect(await heightOf(tester, 'first line'), greaterThan(before * 1.5));
    });

    testWidgets('S-65 · wrap off, after a pinch, the text still scrolls both ways', (
      WidgetTester tester,
    ) async {
      await store.write('rc.files.wrap', 'false');
      await pumpViewer(tester, 'notes.txt');

      await pinch(tester, 80, 40);

      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('the image — B-17', () {
    testWidgets('S-66 · the image opens in a zoomable view', (WidgetTester tester) async {
      files.raws['shot.png'] = RawFile(bytes: onePixel, contentType: 'image/png');
      await pumpViewer(tester, 'shot.png');

      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.bySemanticsLabel(l10n.fileViewerImage('shot.png')), findsOneWidget);
      expect(files.reads, <String>['raw:shot.png']);
    });

    testWidgets('S-67 · a refusal of the bytes says so; "try again" asks again', (
      WidgetTester tester,
    ) async {
      files.failures['shot.png'] = const NetworkFailure(traceId: 't');
      await pumpViewer(tester, 'shot.png');
      expect(find.text(l10n.commonErrorOffline), findsOneWidget);

      files.failures.clear();
      files.raws['shot.png'] = RawFile(bytes: onePixel, contentType: 'image/png');
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.byType(InteractiveViewer), findsOneWidget);
    });

    testWidgets('S-67 · bytes that do not decode say so, with "try again"', (
      WidgetTester tester,
    ) async {
      files.raws['broken.png'] = RawFile(
        bytes: Uint8List.fromList(<int>[1, 2, 3]),
        contentType: 'image/png',
      );
      await tester.runAsync(() async {
        await pumpViewer(tester, 'broken.png');
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      expect(find.text(l10n.commonErrorUnexpected), findsOneWidget);
      expect(find.text(l10n.commonActionRetry), findsOneWidget);
    });

    testWidgets('S-48 · a .png the server says is no image never reaches the decoder', (
      WidgetTester tester,
    ) async {
      files.raws['fake.png'] = const RawFile(bytes: <int>[0], contentType: 'text/plain');
      await pumpViewer(tester, 'fake.png');

      expect(find.text(l10n.fileViewerNoPreview), findsOneWidget);
      expect(find.byType(InteractiveViewer), findsNothing);
    });
  });

  group('the refusals — B-18', () {
    final Map<String, (Failure, String Function(AppLocalizations))> refusals =
        <String, (Failure, String Function(AppLocalizations))>{
          'S-69 · 415 binary': (
            const ServerFailure(
              code: 'FILE_NOT_TEXT',
              messageKey: 'files.error.notText',
              traceId: 't',
              params: <String, String>{'reason': 'binary'},
            ),
            (AppLocalizations l) => l.fileViewerNoPreview,
          ),
          'S-70 · 415 encoding': (
            const ServerFailure(
              code: 'FILE_NOT_TEXT',
              messageKey: 'files.error.notText',
              traceId: 't',
              params: <String, String>{'reason': 'encoding'},
            ),
            (AppLocalizations l) => l.fileViewerEncoding,
          ),
          'S-71 · 413 too large': (
            const ServerFailure(
              code: 'FILE_TOO_LARGE',
              messageKey: 'files.error.tooLarge',
              traceId: 't',
              params: <String, String>{'size': '12000000', 'limit': '10485760'},
            ),
            (AppLocalizations l) => l.fileViewerTooLarge('12 MB'),
          ),
          'S-73 · 422 access denied': (
            const ServerFailure(
              code: 'FILE_ACCESS_DENIED',
              messageKey: 'files.error.accessDenied',
              traceId: 't',
            ),
            (AppLocalizations l) => l.fileViewerDenied,
          ),
          'S-73 · 403 outside the folder': (
            const ServerFailure(
              code: 'WORKSPACE_NOT_ALLOWED',
              messageKey: 'workspace.error.notAllowed',
              traceId: 't',
            ),
            (AppLocalizations l) => l.fileViewerDenied,
          ),
          'a phone not approved': (
            const ServerFailure(
              code: 'DEVICE_NOT_REGISTERED',
              messageKey: 'auth.error.deviceNotRegistered',
              traceId: 't',
            ),
            (AppLocalizations l) => l.filesPanelDevicePending,
          ),
          'a revoked phone': (
            const ServerFailure(
              code: 'DEVICE_REVOKED',
              messageKey: 'auth.error.deviceRevoked',
              traceId: 't',
            ),
            (AppLocalizations l) => l.filesPanelDeviceRevoked,
          ),
        };

    refusals.forEach((String name, (Failure, String Function(AppLocalizations)) refusal) {
      testWidgets('$name says so in its own words, with no "try again"', (
        WidgetTester tester,
      ) async {
        files.failures['notes.txt'] = refusal.$1;
        await pumpViewer(tester, 'notes.txt');

        expect(find.text(refusal.$2(l10n)), findsOneWidget);
        expect(
          find.text(l10n.commonActionRetry),
          refusal.$1.code == 'DEVICE_NOT_REGISTERED' ? findsOneWidget : findsNothing,
        );
      });
    });

    testWidgets(
      'S-72 · the file vanished between listing and opening: it says so, and offers back',
      (WidgetTester tester) async {
        files.failures['notes.txt'] = const ServerFailure(
          code: 'FILE_NOT_FOUND',
          messageKey: 'files.error.notFound',
          traceId: 't',
        );
        await pumpViewer(tester, 'notes.txt');

        expect(find.text(l10n.fileViewerNotFound), findsOneWidget);
        await tester.tap(find.text(l10n.fileViewerBack));
        await tester.pumpAndSettle();
        expect(find.text('home'), findsOneWidget);
      },
    );

    testWidgets('a failure that asking again can change offers "try again"', (
      WidgetTester tester,
    ) async {
      files.failures['notes.txt'] = const NetworkFailure(traceId: 't');
      await pumpViewer(tester, 'notes.txt');

      expect(find.text(l10n.commonErrorOffline), findsOneWidget);
      files.failures.clear();
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();
      expect(find.text('first line'), findsOneWidget);
    });
  });

  group('reading again — B-18', () {
    testWidgets('S-74 · back to the front, it asks with its version; a 304 changes nothing', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(files.reads.last, 'notes.txt|"v1"');
      expect(find.text(l10n.fileViewerChanged), findsNothing);
      expect(find.text('first line'), findsOneWidget);
    });

    testWidgets('S-74 · back from another page over it, it asks again', (
      WidgetTester tester,
    ) async {
      await pumpViewer(tester, 'notes.txt');
      final int reads = files.reads.length;

      unawaited(GoRouter.of(tester.element(find.byType(FileViewerPage))).push<void>('/sessions/x'));
      await tester.pumpAndSettle();
      GoRouter.of(tester.element(find.textContaining('at /sessions'))).pop();
      await tester.pumpAndSettle();

      expect(files.reads.length, reads + 1);
    });

    testWidgets(
      'S-75 · another version replaces the text where the reader was, and says it changed',
      (WidgetTester tester) async {
        files.texts['long.txt'] = TextDocument(
          path: 'long.txt',
          content: List<String>.generate(400, (int i) => 'row $i').join('\n'),
          etag: '"v1"',
        );
        await pumpViewer(tester, 'long.txt');
        await tester.drag(find.byType(ListView), const Offset(0, -2000));
        await tester.pumpAndSettle();
        final double scrolled = tester
            .state<ScrollableState>(find.byType(Scrollable).last)
            .position
            .pixels;
        files.texts['long.txt'] = TextDocument(
          path: 'long.txt',
          content: List<String>.generate(400, (int i) => 'row $i changed').join('\n'),
          etag: '"v2"',
        );

        await menu(tester, l10n.filesPanelRefresh);

        expect(find.text(l10n.fileViewerChanged), findsOneWidget);
        expect(find.textContaining('changed', findRichText: true), findsWidgets);
        expect(
          tester.state<ScrollableState>(find.byType(Scrollable).last).position.pixels,
          scrolled,
        );

        await tester.tap(find.byTooltip('Close'));
        await tester.pumpAndSettle();
        expect(find.text(l10n.fileViewerChanged), findsNothing);
      },
    );

    testWidgets('S-76 · "refresh" in the ⋯ is the same read', (WidgetTester tester) async {
      await pumpViewer(tester, 'notes.txt');

      await menu(tester, l10n.filesPanelRefresh);

      expect(files.reads, <String>['notes.txt|', 'notes.txt|"v1"']);
    });

    testWidgets('"refresh" on an image reads its bytes again', (WidgetTester tester) async {
      files.raws['shot.png'] = RawFile(bytes: onePixel, contentType: 'image/png');
      await pumpViewer(tester, 'shot.png');

      await menu(tester, l10n.filesPanelRefresh);

      expect(files.reads, <String>['raw:shot.png', 'raw:shot.png']);
    });
  });

  group('Claude waiting while the file is read — B-18, D-11', () {
    testWidgets(
      'S-78 · a question of the session shows the strip; "back to the session" lands on its card',
      (WidgetTester tester) async {
        await pumpViewer(tester, 'notes.txt', sessionId: 'session-1');
        expect(find.text(l10n.fileViewerBackToSession), findsNothing);

        permissions.feed.emit(asked(aPermissionRequest()));
        await tester.pumpAndSettle();

        expect(find.text(l10n.fileViewerClaudeWaiting(1)), findsOneWidget);
        await tester.tap(find.text(l10n.fileViewerBackToSession));
        await tester.pumpAndSettle();
        expect(
          find.text('at ${sessionRouteFor('session-1', request: 'request-1')}'),
          findsOneWidget,
        );
      },
    );

    testWidgets('opened from the folder, no session: no strip', (WidgetTester tester) async {
      await pumpViewer(tester, 'notes.txt');

      expect(permissions.feeds, isEmpty);
    });
  });
}
