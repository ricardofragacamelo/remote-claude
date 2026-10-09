/// The viewer stacked over a live session — plan 25, B-14, B-18.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/files.dart';
import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_files_repository.dart';
import '../../../support/pump_app.dart';
import '../../../support/session_screen.dart';

void main() {
  late AppLocalizations l10n;
  late SessionScreen screen;
  late FakeFilesRepository files;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    screen = SessionScreen();
    files = FakeFilesRepository()..levels[''] = <FileEntry>[aFile('notes.txt')];
  });

  Future<void> pump(WidgetTester tester) => screen.pump(
    tester,
    routed: true,
    extra: <Override>[filesRepositoryProvider.overrideWithValue(files)],
  );

  Future<void> openFile(WidgetTester tester, {int taps = 1}) async {
    await tester.tap(find.byTooltip(l10n.filesPanelOpen));
    await tester.pumpAndSettle();
    for (int tap = 0; tap < taps; tap++) {
      await tester.tap(find.text('notes.txt'), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pumpAndSettle();
  }

  GoRouter router(WidgetTester tester) =>
      GoRouter.of(tester.element(find.textContaining('at /files/view')));

  testWidgets(
    'S-51 · open a file and come back: the box keeps its text, the conversation its place',
    (WidgetTester tester) async {
      await pump(tester);
      await tester.enterText(find.byType(TextField), 'half a thought');

      await openFile(tester);
      expect(
        find.text('at ${viewerRouteFor('/tmp/work', 'notes.txt', sessionId: 'session-1')}'),
        findsOneWidget,
      );

      router(tester).pop();
      await tester.pumpAndSettle();

      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'half a thought');
    },
  );

  testWidgets(
    'the panel steps aside for the viewer: back on the conversation, and the same level reopens',
    (WidgetTester tester) async {
      files.levels['docs'] = <FileEntry>[aFile('docs/notes.txt')];
      files.levels[''] = <FileEntry>[aFolder('docs')];
      await pump(tester);
      await tester.tap(find.byTooltip(l10n.filesPanelOpen));
      await tester.pumpAndSettle();
      await tester.tap(find.text('docs'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('notes.txt'));
      await tester.pumpAndSettle();
      router(tester).pop();
      await tester.pumpAndSettle();

      expect(find.byType(FilesPanel), findsNothing, reason: 'D-33: the conversation, uncovered');
      await tester.tap(find.byTooltip(l10n.filesPanelOpen));
      await tester.pumpAndSettle();
      expect(find.text('notes.txt'), findsOneWidget);
    },
  );

  testWidgets('S-52 · two quick taps on the same file stack one viewer', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    await openFile(tester, taps: 2);
    router(tester).pop();
    await tester.pumpAndSettle();

    expect(find.byType(SessionPage), findsOneWidget);
    expect(find.textContaining('at /files/view'), findsNothing);
  });

  testWidgets(
    'S-79 · the session goes on under the viewer: back, the conversation has what arrived',
    (WidgetTester tester) async {
      await pump(tester);
      await openFile(tester);

      screen.sessions.emit(
        arrivalOf(messageCompleted(messageId: 'm-1', text: 'written while you read', seq: 2)),
      );
      await tester.pump();
      router(tester).pop();
      await tester.pumpAndSettle();

      expect(find.textContaining('written while you read', findRichText: true), findsOneWidget);
      unawaited(Future<void>.value());
    },
  );
}
