/// The preview of a markdown file — plan 25, B-19…B-22.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/mermaid_block.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import '../../../support/builders/images.dart';
import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/fake_diagram_engine.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/pump_app.dart';

const String folder = '/home/someone/project';

/// The system's way out of the app, recorded.
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

  @override
  Future<bool> canLaunch(String url) async => true;
}

void main() {
  late AppLocalizations l10n;
  late FakeFilesRepository files;
  late FakeDiagramEngine engine;
  late _RecordingLauncher launcher;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    files = FakeFilesRepository();
    engine = FakeDiagramEngine();
    launcher = _RecordingLauncher();
    UrlLauncherPlatform.instance = launcher;
  });

  void markdown(String path, String content) =>
      files.texts[path] = TextDocument(path: path, content: content, etag: '"1"');

  Future<void> pumpViewer(WidgetTester tester, String path) async {
    await tester.pumpRouted(
      <RouteBase>[
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
      ],
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(files),
        credentialStoreProvider.overrideWithValue(FakeCredentialStore()),
        diagramEngineProvider.overrideWithValue(engine),
      ],
    );
    await tester.tap(find.text('home'));
    await tester.pumpAndSettle();
  }

  group('the preview — B-19', () {
    testWidgets('S-80 · titles, lists, code and a table are drawn', (WidgetTester tester) async {
      markdown(
        'README.md',
        '# Title\n\n- one\n- two\n\n```dart\nfinal a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
      );
      await pumpViewer(tester, 'README.md');

      expect(find.text('Title'), findsOneWidget);
      expect(find.textContaining('one', findRichText: true), findsWidgets);
      expect(find.textContaining('final a = 1;', findRichText: true), findsOneWidget);
      expect(find.byType(Table), findsOneWidget);
    });

    testWidgets(
      'S-81 · the switch goes to the source — the text viewer, with the wrap — and back',
      (WidgetTester tester) async {
        markdown('README.md', '# Title\n');
        await pumpViewer(tester, 'README.md');

        await tester.tap(find.byTooltip(l10n.markdownSource));
        await tester.pumpAndSettle();
        expect(find.textContaining('# Title', findRichText: true), findsOneWidget);
        expect(find.text('1'), findsOneWidget);

        await tester.tap(find.byTooltip(l10n.markdownPreview));
        await tester.pumpAndSettle();
        expect(find.text('Title'), findsOneWidget);
      },
    );

    testWidgets('S-82 · embedded HTML is shown as text, and no element comes of it', (
      WidgetTester tester,
    ) async {
      markdown(
        'evil.md',
        'Before\n\n<script>alert(1)</script>\n\nInline <img src=x onerror="alert(1)"> and '
            '<a href="javascript:alert(1)">html link</a>.\n\n<div onclick="x()">block</div>\n',
      );
      await pumpViewer(tester, 'evil.md');

      expect(find.textContaining('<script>alert(1)</script>', findRichText: true), findsOneWidget);
      expect(find.textContaining('<img src=x onerror', findRichText: true), findsOneWidget);
      expect(
        find.textContaining('<div onclick="x()">block</div>', findRichText: true),
        findsOneWidget,
      );
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('S-83 · a wide table scrolls in its own box, and the page does not', (
      WidgetTester tester,
    ) async {
      tester.view
        ..physicalSize = const Size(360, 640)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final String header = List<String>.generate(14, (int i) => 'column $i').join(' | ');
      final String rule = List<String>.filled(14, '---').join('|');
      final String row = List<String>.generate(14, (int i) => 'value $i').join(' | ');
      markdown('wide.md', '| $header |\n|$rule|\n| $row |\n');
      await pumpViewer(tester, 'wide.md');

      final Finder box = find.ancestor(
        of: find.byType(Table),
        matching: find.byWidgetPredicate(
          (Widget w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
        ),
      );
      expect(box, findsOneWidget);
      expect(tester.getSize(find.byType(Table)).width, greaterThan(360));
      expect(tester.takeException(), isNull);
    });

    testWidgets('S-84 · a pinch scales the text of the preview, up to three times', (
      WidgetTester tester,
    ) async {
      markdown('README.md', 'Some words of the preview.\n');
      await pumpViewer(tester, 'README.md');
      double scale() => tester
          .widget<RichText>(find.textContaining('Some words', findRichText: true))
          .textScaler
          .scale(10);
      final double before = scale();

      final Offset center = tester.getCenter(find.byType(SelectionArea));
      final TestGesture a = await tester.startGesture(center - const Offset(20, 0), pointer: 7);
      final TestGesture b = await tester.startGesture(center + const Offset(20, 0), pointer: 8);
      await a.moveTo(center - const Offset(200, 0));
      await b.moveTo(center + const Offset(200, 0));
      await a.up();
      await b.up();
      await tester.pumpAndSettle();

      expect(scale(), closeTo(before * 3, 0.01));
    });

    testWidgets('S-85 · an empty markdown says it is empty', (WidgetTester tester) async {
      markdown('empty.md', '  \n');
      await pumpViewer(tester, 'empty.md');

      expect(find.text(l10n.fileViewerEmpty), findsOneWidget);
    });
  });

  group('links and images — B-20', () {
    testWidgets('S-88 · a relative link opens the viewer of that file', (
      WidgetTester tester,
    ) async {
      markdown('docs/index.md', 'See [the plan](../plans/x.md).\n');
      markdown('plans/x.md', '# The plan\n');
      await pumpViewer(tester, 'docs/index.md');

      await tester.tap(find.textContaining('the plan', findRichText: true));
      await tester.pumpAndSettle();

      expect(find.text('The plan'), findsOneWidget);
      expect(files.reads.last, 'plans/x.md|');
    });

    testWidgets('S-87 · a link out of the folder says why, and opens nothing', (
      WidgetTester tester,
    ) async {
      markdown('a.md', '[out](../../etc/passwd)\n');
      await pumpViewer(tester, 'a.md');

      await tester.tap(find.textContaining('out', findRichText: true));
      await tester.pump();

      expect(find.text(l10n.markdownLinkOutside), findsOneWidget);
      expect(files.reads, <String>['a.md|']);
    });

    testWidgets('S-90 · a javascript: link does not open, and says so', (
      WidgetTester tester,
    ) async {
      markdown('a.md', '[js](javascript:alert(1))\n');
      await pumpViewer(tester, 'a.md');

      await tester.tap(find.textContaining('js', findRichText: true));
      await tester.pump();

      expect(find.text(l10n.markdownLinkRefused), findsOneWidget);
      expect(launcher.launched, isEmpty);
    });

    testWidgets('S-89 · an https link asks, showing the address; confirmed, the system opens it', (
      WidgetTester tester,
    ) async {
      markdown('a.md', '[site](https://example.com/page)\n');
      await pumpViewer(tester, 'a.md');

      await tester.tap(find.textContaining('site', findRichText: true));
      await tester.pumpAndSettle();
      expect(find.text(l10n.markdownLinkConfirm), findsOneWidget);
      expect(find.text('https://example.com/page'), findsOneWidget);

      await tester.tap(find.text(l10n.markdownLinkOpen));
      await tester.pumpAndSettle();
      expect(launcher.launched, <String>['https://example.com/page']);
    });

    testWidgets('S-89 · cancelled, nothing opens', (WidgetTester tester) async {
      markdown('a.md', '[mail](mailto:a@b.c)\n');
      await pumpViewer(tester, 'a.md');

      await tester.tap(find.textContaining('mail', findRichText: true));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(launcher.launched, isEmpty);
    });

    testWidgets('S-91 · a relative image comes from the folder', (WidgetTester tester) async {
      files.raws['docs/img/shot.png'] = RawFile(bytes: onePixel, contentType: 'image/png');
      markdown('docs/a.md', '![a shot](img/shot.png)\n');
      await pumpViewer(tester, 'docs/a.md');

      // Not decoded in a test, the image has no height yet: it is there, off the painted area.
      expect(find.byType(Image, skipOffstage: false), findsOneWidget);
      expect(files.reads, contains('raw:docs/img/shot.png'));
    });

    testWidgets('S-92 · a remote image is never loaded: its words and address stand in its place', (
      WidgetTester tester,
    ) async {
      markdown('a.md', '![tracker](https://tracker.example.com/p.gif)\n');
      await pumpViewer(tester, 'a.md');

      expect(find.byType(Image), findsNothing);
      expect(
        find.text(l10n.markdownRemoteImage('tracker — https://tracker.example.com/p.gif')),
        findsOneWidget,
      );
      expect(files.reads.where((String read) => read.startsWith('raw:')), isEmpty);
    });

    testWidgets('a relative image whose bytes do not decode shows its words', (
      WidgetTester tester,
    ) async {
      files.raws['broken.png'] = const RawFile(bytes: <int>[1, 2, 3], contentType: 'image/png');
      markdown('a.md', '![the chart](broken.png)\n');
      await tester.runAsync(() async {
        await pumpViewer(tester, 'a.md');
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      expect(find.text('the chart — broken.png'), findsOneWidget);
    });

    testWidgets('S-93 · a relative image that is not there shows its words', (
      WidgetTester tester,
    ) async {
      files.failures['missing.png'] = Exception('404');
      markdown('a.md', '![the chart](missing.png)\n');
      await pumpViewer(tester, 'a.md');

      expect(find.byType(Image), findsNothing);
      expect(find.text('the chart — missing.png'), findsOneWidget);
    });
  });

  group('the mermaid block — B-22', () {
    const String flow = 'flowchart TD\n  A --> B';

    testWidgets(
      'S-101 · a valid block becomes an image fitted to the width; the source keeps the code',
      (WidgetTester tester) async {
        markdown('d.md', '# Flow\n\n```mermaid\n$flow\n```\n');
        await pumpViewer(tester, 'd.md');

        expect(find.bySemanticsLabel(l10n.diagramLabel), findsOneWidget);
        expect(engine.asked.single.code, flow);

        await tester.tap(find.byTooltip(l10n.markdownSource));
        await tester.pumpAndSettle();
        expect(find.textContaining('```mermaid', findRichText: true), findsOneWidget);
      },
    );

    testWidgets(
      'S-102 · while it draws, a reserved space that says so; then the image named "diagram"',
      (WidgetTester tester) async {
        engine.gate = Completer<void>();
        markdown('d.md', '```mermaid\n$flow\n```\n');
        await pumpViewer(tester, 'd.md');

        expect(find.bySemanticsLabel(l10n.diagramDrawing), findsOneWidget);
        engine.gate!.complete();
        await tester.pumpAndSettle();
        expect(find.bySemanticsLabel(l10n.diagramLabel), findsOneWidget);
      },
    );

    testWidgets('S-103 · invalid code: the code, and above it the error with its line', (
      WidgetTester tester,
    ) async {
      engine.answers['nonsense ((('] = const DiagramInvalid(line: 2);
      markdown('d.md', '```mermaid\nnonsense (((\n```\n');
      await pumpViewer(tester, 'd.md');

      expect(find.text(l10n.diagramInvalidLine(2)), findsOneWidget);
      expect(find.text('nonsense ((('), findsOneWidget);
    });

    testWidgets('an engine that could not draw shows the code, saying so', (
      WidgetTester tester,
    ) async {
      engine.answers['graph'] = const DiagramUnavailable();
      engine.answers['other'] = const DiagramInvalid();
      markdown('d.md', '```mermaid\ngraph\n```\n\n```mermaid\nother\n```\n');
      await pumpViewer(tester, 'd.md');

      expect(find.text(l10n.diagramUnavailable), findsOneWidget);
      expect(find.text(l10n.diagramInvalid), findsOneWidget);
    });

    testWidgets(
      'S-104 · past the ceiling: the code, with the warning, and the engine never asked',
      (WidgetTester tester) async {
        final String huge = 'flowchart TD\n${'  A --> B\n' * 6000}';
        markdown('d.md', '```mermaid\n$huge```\n');
        await pumpViewer(tester, 'd.md');

        expect(find.textContaining('too large to draw', findRichText: true), findsOneWidget);
        expect(engine.asked, isEmpty);
      },
    );

    testWidgets(
      'S-105 · a tap opens it full screen, sharper, with zoom; back, the preview is where it was',
      (WidgetTester tester) async {
        markdown('d.md', '```mermaid\n$flow\n```\n');
        await pumpViewer(tester, 'd.md');

        await tester.tap(find.bySemanticsLabel(l10n.diagramLabel));
        await tester.pumpAndSettle();

        expect(find.byType(InteractiveViewer), findsOneWidget);
        expect(engine.asked.last.density, greaterThan(engine.asked.first.density));

        await tester.tap(find.byTooltip('Close'));
        await tester.pumpAndSettle();
        expect(find.byType(InteractiveViewer), findsNothing);
        expect(find.bySemanticsLabel(l10n.diagramLabel), findsOneWidget);
      },
    );

    testWidgets('full screen, a drawing that fails says so, and the preview keeps its image', (
      WidgetTester tester,
    ) async {
      markdown('d.md', '```mermaid\n$flow\n```\n');
      await pumpViewer(tester, 'd.md');
      engine.answers[flow] = const DiagramUnavailable();

      await tester.tap(find.bySemanticsLabel(l10n.diagramLabel));
      await tester.pumpAndSettle();

      expect(find.text(l10n.diagramUnavailable), findsOneWidget);
    });

    testWidgets(
      'S-106 · a change of the app\'s theme draws the diagram again in Mermaid\'s dark one',
      (WidgetTester tester) async {
        final List<Override> overrides = <Override>[
          diagramEngineProvider.overrideWithValue(engine),
        ];
        await tester.pumpApp(
          const MermaidBlock(code: flow),
          overrides: overrides,
          theme: AppTheme.light(),
        );
        await tester.pumpAndSettle();
        expect(engine.asked.single.theme, DiagramTheme.light);

        await tester.pumpApp(
          const MermaidBlock(code: flow),
          overrides: overrides,
          theme: AppTheme.dark(),
        );
        await tester.pumpAndSettle();

        expect(engine.asked.map((DiagramRequest r) => r.theme), <DiagramTheme>[
          DiagramTheme.light,
          DiagramTheme.dark,
        ]);
        expect(find.bySemanticsLabel(l10n.diagramLabel), findsOneWidget);
      },
    );
  });
}
