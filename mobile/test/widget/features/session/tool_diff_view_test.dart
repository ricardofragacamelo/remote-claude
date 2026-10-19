/// The diff of a `file.edit`/`file.write` call: the box the card opens to once it has one (plan 26,
/// B-16).
library;

import 'dart:async';

import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_diff_view.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_tool_diff_repository.dart';
import '../../../support/pump_app.dart';

ToolDiff _diffOf(int lineCount) => ToolDiff(
  path: '/w/a.ts',
  hunks: <DiffHunk>[
    DiffHunk(
      id: 'h1',
      lines: <DiffLine>[
        for (int i = 0; i < lineCount; i += 1)
          DiffLine(kind: DiffLineKind.added, text: 'line $i', newLine: i + 1),
      ],
    ),
  ],
);

void main() {
  late FakeToolDiffRepository repo;
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => repo = FakeToolDiffRepository());

  Future<void> pump(WidgetTester tester, {bool pumpOnce = true}) => tester.pumpApp(
    const ToolDiffView(sessionId: 's1', toolUseId: 't1'),
    overrides: <Override>[toolDiffRepositoryProvider.overrideWithValue(repo)],
    pumpOnce: pumpOnce,
  );

  testWidgets('loading says so', (WidgetTester tester) async {
    repo.gate = Completer<void>();
    await pump(tester, pumpOnce: false);
    await tester.pump();

    expect(find.text(l10n.sessionDiffLoading), findsOneWidget);
    repo.gate!.complete();
  });

  testWidgets('S-57 · one hunk is drawn, removed and added each with their own sign', (
    WidgetTester tester,
  ) async {
    repo.diffs['t1'] = const ToolDiff(
      path: '/w/a.ts',
      hunks: <DiffHunk>[
        DiffHunk(
          id: 'h1',
          lines: <DiffLine>[
            DiffLine(kind: DiffLineKind.context, text: 'same', oldLine: 1, newLine: 1),
            DiffLine(kind: DiffLineKind.removed, text: 'old', oldLine: 2),
            DiffLine(kind: DiffLineKind.added, text: 'new', newLine: 2),
          ],
        ),
      ],
    );
    await pump(tester);

    expect(find.text('same'), findsOneWidget);
    expect(find.text('old'), findsOneWidget);
    expect(find.text('new'), findsOneWidget);
    expect(find.text('+'), findsOneWidget);
    expect(find.text('-'), findsOneWidget);
  });

  testWidgets('S-59 · past the ceiling, only the fold shows — "show all" reveals the rest', (
    WidgetTester tester,
  ) async {
    repo.diffs['t1'] = _diffOf(diffFoldLines + 5);
    await pump(tester);

    expect(find.text('line 0'), findsOneWidget);
    expect(find.text('line ${diffFoldLines - 1}'), findsOneWidget);
    expect(find.text('line $diffFoldLines'), findsNothing);
    expect(find.text(l10n.diffHunksShowAll(diffFoldLines + 5)), findsOneWidget);

    await tester.tap(find.text(l10n.diffHunksShowAll(diffFoldLines + 5)));
    await tester.pump();

    expect(find.text('line $diffFoldLines'), findsOneWidget);
    expect(find.text('line ${diffFoldLines + 4}'), findsOneWidget);
  });

  testWidgets('no change at all is said, not drawn as an empty box', (WidgetTester tester) async {
    repo.diffs['t1'] = const ToolDiff(path: '/w/a.ts', hunks: <DiffHunk>[]);
    await pump(tester);

    expect(find.text(l10n.sessionDiffUnchanged), findsOneWidget);
  });

  group('S-60 · the route answers with nothing to show', () {
    testWidgets(
      'DIFF_NOT_APPLICABLE says why, and offers no retry — asking again answers the same',
      (WidgetTester tester) async {
        repo.failure = const ServerFailure(
          code: 'DIFF_NOT_APPLICABLE',
          messageKey: 'session.error.diffNotApplicable',
          traceId: 't',
        );
        await pump(tester);

        expect(find.text(l10n.sessionErrorDiffNotApplicable), findsOneWidget);
        expect(find.text(l10n.commonActionRetry), findsNothing);
      },
    );

    testWidgets('FILE_NOT_TEXT says why, and offers no retry either', (WidgetTester tester) async {
      repo.failure = const ServerFailure(
        code: 'FILE_NOT_TEXT',
        messageKey: 'files.error.notText',
        traceId: 't',
        params: <String, String>{'path': '/w/a.bin'},
      );
      await pump(tester);

      expect(find.text(l10n.filesErrorNotText('/w/a.bin')), findsOneWidget);
      expect(find.text(l10n.commonActionRetry), findsNothing);
    });
  });

  testWidgets('a failure asking again might fix offers "try again", and asks once more', (
    WidgetTester tester,
  ) async {
    repo.failure = const NetworkFailure(traceId: 't');
    await pump(tester);

    expect(find.text(l10n.commonActionRetry), findsOneWidget);
    expect(repo.reads, hasLength(1));

    repo.failure = null;
    repo.diffs['t1'] = const ToolDiff(path: '/w/a.ts', hunks: <DiffHunk>[]);
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();

    expect(repo.reads, hasLength(2));
    expect(find.text(l10n.sessionDiffUnchanged), findsOneWidget);
  });
}
