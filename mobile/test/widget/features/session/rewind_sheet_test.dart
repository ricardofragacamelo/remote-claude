/// The undo sheet, opened from the session screen: the reach said before anything is touched
/// (B-19, B-21).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/builders/undo.dart';
import '../../../support/pump_app.dart';
import '../../../support/session_screen.dart';

const Failure locked = ServerFailure(
  code: 'SESSION_LOCKED',
  messageKey: 'session.error.locked',
  traceId: 'trace-1',
);

void main() {
  late AppLocalizations l10n;
  late SessionScreen screen;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => screen = SessionScreen()..checkpoints.answer = <Checkpoint>[aCheckpoint()]);

  Future<void> openUndo(WidgetTester tester) async {
    // Tall enough for the whole confirmation to be laid out: a list builds only what it shows,
    // and every row of it is what these tests read.
    tester.view
      ..physicalSize = const Size(1080, 4000)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.tap(find.byTooltip(l10n.sessionMenuOpen));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.sessionMenuUndo));
    await tester.pumpAndSettle();
  }

  Future<void> choose(WidgetTester tester, String label) async {
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  Finder confirm() => find.widgetWithText(FilledButton, l10n.sessionUndoConfirm);

  FilledButton confirmButton(WidgetTester tester) => tester.widget<FilledButton>(confirm());

  testWidgets('lists the points newest first, with their label, their time and their reach', (
    WidgetTester tester,
  ) async {
    screen.checkpoints.answer = <Checkpoint>[
      aCheckpoint(promptId: 'prompt-2', label: null),
      aCheckpoint(),
    ];
    await screen.pump(tester);
    await openUndo(tester);

    expect(screen.checkpoints.reads, <String>['session-1']);
    expect(find.text(l10n.sessionUndoTitle), findsOneWidget);
    expect(find.text(l10n.sessionUndoUntitled), findsOneWidget);
    expect(find.text('refactor the parser'), findsOneWidget);
    expect(find.text(l10n.sessionUndoFileCount(4)), findsNWidgets(2));
    expect(
      tester.getTopLeft(find.text(l10n.sessionUndoUntitled)).dy,
      lessThan(tester.getTopLeft(find.text('refactor the parser')).dy),
    );
  });

  testWidgets(
    'S-38 · the confirmation says which files go back, which stay and why, and where to',
    (WidgetTester tester) async {
      await screen.pump(tester);
      await openUndo(tester);
      await choose(tester, 'refactor the parser');

      expect(find.text(l10n.sessionUndoConfirmTitle('refactor the parser')), findsOneWidget);
      expect(find.text(l10n.sessionUndoGoesBack), findsOneWidget);
      expect(find.text('/home/someone/project/a.ts'), findsOneWidget);
      expect(find.text(l10n.sessionUndoRestore), findsOneWidget);
      expect(find.text('/home/someone/project/new.ts'), findsOneWidget);
      expect(find.text(l10n.sessionUndoDelete), findsOneWidget);
      expect(find.text(l10n.sessionUndoStays), findsOneWidget);
      expect(find.text('/home/someone/project/b.ts'), findsOneWidget);
      expect(find.text(l10n.sessionUndoReasonModifiedOutside), findsOneWidget);
      expect(find.text(l10n.sessionUndoAlready), findsOneWidget);
      expect(find.text('/home/someone/project/c.ts'), findsOneWidget);
      expect(confirmButton(tester).onPressed, isNotNull);
    },
  );

  testWidgets('every reason a file stays is said in words', (WidgetTester tester) async {
    screen.checkpoints.answer = <Checkpoint>[
      aCheckpoint(
        toPreserve: <PreservedFile>[
          for (final PreserveReason reason in PreserveReason.values)
            PreservedFile(path: '/p/${reason.name}', reason: reason),
        ],
      ),
    ];
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    for (final String sentence in <String>[
      l10n.sessionUndoReasonModifiedOutside,
      l10n.sessionUndoReasonNotRestorable,
      l10n.sessionUndoReasonUnsafePath,
      l10n.sessionUndoReasonNoBaseline,
      l10n.sessionUndoReasonOther,
    ]) {
      expect(find.text(sentence), findsOneWidget, reason: sentence);
    }
  });

  testWidgets('a point where nothing would go back disables the undo, and says why', (
    WidgetTester tester,
  ) async {
    screen.checkpoints.answer = <Checkpoint>[aCheckpoint(toRevert: const <RevertedFile>[])];
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    expect(find.text(l10n.sessionUndoNothingToRevert), findsOneWidget);
    expect(find.text(l10n.sessionUndoGoesBack), findsNothing);
    expect(confirmButton(tester).onPressed, isNull);
  });

  testWidgets('S-43 · while a turn runs the undo is disabled, with the reason', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    screen.sessions.emit(arrivalOf(sessionStatusChanged(status: 'running', seq: 2)));
    await tester.pumpAndSettle();
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    expect(find.text(l10n.sessionUndoBusy), findsOneWidget);
    expect(confirmButton(tester).onPressed, isNull);
  });

  testWidgets('offline, the undo is disabled, with the reason', (WidgetTester tester) async {
    await screen.pump(tester, connection: ConnectionStatus.closed);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    expect(find.text(l10n.sessionUndoOffline), findsOneWidget);
    expect(confirmButton(tester).onPressed, isNull);
  });

  testWidgets('S-37 · confirming sends the undo, waits, and shows what it did', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    await tester.tap(confirm());
    await tester.pumpAndSettle();

    expect(screen.sessions.commands.single.$1, 'session.rewindFiles');
    expect(screen.sessions.commands.single.$2['promptId'], 'prompt-1');
    final Finder pending = find.widgetWithText(FilledButton, l10n.sessionUndoPending);
    expect(tester.widget<FilledButton>(pending).onPressed, isNull);

    screen.sessions.emit(
      arrivalOf(
        sessionRewound(
          seq: 5,
          payload: rewoundPayload(failed: const <String>['/home/someone/project/d.ts']),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionUndoDoneTitle), findsOneWidget);
    expect(find.text(l10n.sessionUndoReverted), findsOneWidget);
    expect(find.text(l10n.sessionUndoRestored), findsOneWidget);
    expect(find.text(l10n.sessionUndoDeleted), findsOneWidget);
    expect(find.text(l10n.sessionUndoReasonModifiedOutside), findsOneWidget);
    expect(find.text(l10n.sessionUndoAlready), findsOneWidget);
    expect(find.text(l10n.sessionUndoFailed), findsOneWidget);
    expect(find.text('/home/someone/project/d.ts'), findsOneWidget);
    // And the points are read again: the reach of every one of them just changed.
    expect(screen.checkpoints.reads, hasLength(2));

    // S-44 · the session saying some files could not be put back.
    screen.sessions.emit(
      const SessionFailed(
        ServerFailure(
          code: 'INTERNAL_ERROR',
          messageKey: 'session.error.rewindIncomplete',
          traceId: 't',
          params: <String, String>{'failed': '1'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(l10n.sessionErrorRewindIncomplete('1')), findsOneWidget);

    await tester.tap(find.text(l10n.sessionUndoBack));
    await tester.pumpAndSettle();
    expect(find.text('refactor the parser'), findsOneWidget);
    expect(find.text(l10n.sessionUndoDoneTitle), findsNothing);
  });

  testWidgets('S-43 · a refusal because a turn is running is said in words', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');
    await tester.tap(confirm());
    await tester.pumpAndSettle();

    screen.sessions.emit(const CommandRefused(commandId: 'command-1', failure: locked));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionErrorLocked), findsOneWidget);
    expect(confirmButton(tester).onPressed, isNotNull);
  });

  testWidgets('a point that is not this session’s is refused in words', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');
    await tester.tap(confirm());
    await tester.pumpAndSettle();

    screen.sessions.emit(
      const CommandRefused(
        commandId: 'command-1',
        failure: ServerFailure(
          code: 'INVALID_INPUT',
          messageKey: 'session.error.rewindTargetUnknown',
          traceId: 't',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionErrorRewindTargetUnknown), findsOneWidget);
  });

  testWidgets('S-76 · an undo the socket did not send says so', (WidgetTester tester) async {
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');
    screen.sessions.accepts = false;

    await tester.tap(confirm());
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionUndoNotSent), findsOneWidget);
  });

  testWidgets('going back from the confirmation shows the points again', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    await tester.tap(find.text(l10n.sessionUndoBack));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionUndoGoesBack), findsNothing);
    expect(find.text('refactor the parser'), findsOneWidget);
  });

  testWidgets('a finished turn reads the points again while the sheet is open', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    screen.checkpoints.answer = <Checkpoint>[
      aCheckpoint(promptId: 'prompt-2', label: 'add the tests'),
      aCheckpoint(),
    ];

    screen.sessions.emit(arrivalOf(turnCompleted(seq: 3)));
    await tester.pumpAndSettle();

    expect(find.text('add the tests'), findsOneWidget);
  });

  testWidgets('points that could not be read again stay, with the reason above them', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    await openUndo(tester);
    screen.checkpoints.failure = locked;

    screen.sessions.emit(arrivalOf(turnCompleted(seq: 3)));
    await tester.pumpAndSettle();

    expect(find.text('refactor the parser'), findsOneWidget);
    expect(find.text(l10n.sessionErrorLocked), findsOneWidget);

    await choose(tester, 'refactor the parser');
    expect(find.text(l10n.sessionErrorLocked), findsOneWidget);
  });

  testWidgets('S-39 · a closed session says undo is not available, and reads nothing', (
    WidgetTester tester,
  ) async {
    await screen.pump(tester);
    screen.sessions.emit(arrivalOf(sessionClosed(seq: 2)));
    await tester.pumpAndSettle();
    await openUndo(tester);

    expect(find.text(l10n.sessionUndoClosed), findsOneWidget);
    expect(screen.checkpoints.reads, isEmpty);
  });

  testWidgets('says it is loading while the points are read', (WidgetTester tester) async {
    screen.checkpoints.gate = Completer<void>();
    await screen.pump(tester);
    await tester.tap(find.byTooltip(l10n.sessionMenuOpen));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.sessionMenuUndo));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(l10n.sessionUndoLoading), findsOneWidget);

    screen.checkpoints.gate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('refactor the parser'), findsOneWidget);
  });

  testWidgets('a session with no points says there is nothing to undo yet', (
    WidgetTester tester,
  ) async {
    screen.checkpoints.answer = const <Checkpoint>[];
    await screen.pump(tester);
    await openUndo(tester);

    expect(find.text(l10n.sessionUndoEmptyTitle), findsOneWidget);
    expect(find.text(l10n.sessionUndoEmptyBody), findsOneWidget);
  });

  testWidgets('points that could not be read say why, and are read again on retry', (
    WidgetTester tester,
  ) async {
    screen.checkpoints.failure = const ServerFailure(
      code: 'SESSION_NOT_FOUND',
      messageKey: 'session.error.notFound',
      traceId: 't',
    );
    await screen.pump(tester);
    await openUndo(tester);

    expect(find.text(l10n.sessionErrorNotFound), findsOneWidget);

    screen.checkpoints.failure = null;
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();

    expect(find.text('refactor the parser'), findsOneWidget);
  });

  testWidgets('the sheet meets the tap-target and label guidelines', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await screen.pump(tester);
    await openUndo(tester);
    await choose(tester, 'refactor the parser');

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });
}
