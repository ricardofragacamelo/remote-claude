/// The composer: the box and its bar — `/` · mode · model · effort · context · send or stop
/// (plan 10, B-10).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/presentation/widgets/chat_composer.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

/// A choice that records its opening.
ComposerChoice choiceOf(String label, String value, List<String> opened, {bool compact = false}) =>
    ComposerChoice(
      label: label,
      value: value,
      icon: Icons.tune,
      compact: compact,
      onOpen: () => opened.add(label),
    );

void main() {
  late AppLocalizations l10n;
  late TextEditingController box;
  late List<String> sent;
  late List<String> opened;
  late int stops;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() {
    box = TextEditingController();
    sent = <String>[];
    opened = <String>[];
    stops = 0;
  });

  tearDown(() => box.dispose());

  Future<void> pump(
    WidgetTester tester, {
    ComposerState state = const ComposerState(),
    SendOutcome outcome = SendOutcome.sent,
    List<ComposerChoice>? choices,
  }) => tester.pumpApp(
    Align(
      alignment: Alignment.bottomCenter,
      child: ChatComposer(
        controller: box,
        state: state,
        onSend: (String text) {
          sent.add(text);
          return outcome;
        },
        onStop: () => stops += 1,
        mode: choiceOf('Mode', 'Ask me', opened),
        choices:
            choices ??
            <ComposerChoice>[
              choiceOf('Model', 'Sonnet', opened),
              choiceOf('Effort', 'High', opened),
              choiceOf('Context', '25%', opened, compact: true),
            ],
      ),
    ),
  );

  Finder field() => find.byType(TextField);

  testWidgets('S-27 · the bar offers / , mode, model, effort, context and send, each named', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pump(tester);

    expect(find.byTooltip(l10n.composerSlash), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.composerChoice('Mode', 'Ask me')), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.composerChoice('Model', 'Sonnet')), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.composerChoice('Effort', 'High')), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.composerChoice('Context', '25%')), findsOneWidget);
    expect(find.byTooltip(l10n.sessionPromptAction), findsOneWidget);

    await tester.tap(find.text('Sonnet'));
    await tester.tap(find.text('Ask me'));
    expect(opened, <String>['Model', 'Mode']);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });

  testWidgets('sends what was typed and clears itself', (WidgetTester tester) async {
    await pump(tester);

    await tester.enterText(field(), '  do the thing  ');
    await tester.pump();
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pump();

    expect(sent, <String>['do the thing']);
    expect(box.text, isEmpty);
  });

  testWidgets('S-31 · a prompt the socket did not take is kept, and the box says so', (
    WidgetTester tester,
  ) async {
    await pump(tester, outcome: SendOutcome.notSent);

    await tester.enterText(field(), 'do not lose this');
    await tester.pump();
    await tester.tap(find.byTooltip(l10n.sessionPromptAction));
    await tester.pump();

    expect(find.text(l10n.sessionPromptRefused), findsOneWidget);
    expect(box.text, 'do not lose this');
  });

  testWidgets('a send that waits on its session keeps the text, and says what it waits for', (
    WidgetTester tester,
  ) async {
    await pump(
      tester,
      outcome: SendOutcome.pending,
      state: const ComposerState(isBusy: true, busyLabel: 'Opening…'),
    );

    await tester.enterText(field(), 'first prompt');
    await tester.pump();

    expect(find.byTooltip('Opening…'), findsOneWidget);
    expect(
      tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.send)).onPressed,
      isNull,
    );
    expect(box.text, 'first prompt');
  });

  testWidgets('S-41 · with the box empty, the reason not to send is on the button alone', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pump(tester);

    expect(
      tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.send)).onPressed,
      isNull,
    );
    expect(find.text(l10n.composerEmpty), findsNothing);
    expect(
      find.byWidgetPredicate(
        (Widget widget) => widget is Semantics && widget.properties.hint == l10n.composerEmpty,
      ),
      findsOneWidget,
    );

    await tester.enterText(field(), '   ');
    await tester.pump();
    expect(
      tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.send)).onPressed,
      isNull,
    );
    semantics.dispose();
  });

  testWidgets('a box that may not send cannot be written in, nor open the commands', (
    WidgetTester tester,
  ) async {
    await pump(tester, state: const ComposerState(isEnabled: false));

    expect(tester.widget<TextField>(field()).enabled, isFalse);
    expect(
      tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.terminal)).onPressed,
      isNull,
    );
  });

  group('send and stop — 09 · D-06', () {
    testWidgets('S-28 · a turn running with the box empty: the button is stop', (
      WidgetTester tester,
    ) async {
      await pump(tester, state: const ComposerState(isTurnRunning: true));

      expect(find.byTooltip(l10n.composerStop), findsOneWidget);
      expect(find.byIcon(Icons.send), findsNothing);

      await tester.tap(find.byTooltip(l10n.composerStop));
      expect(stops, 1);
    });

    testWidgets('a stop on its way is not offered again', (WidgetTester tester) async {
      await pump(tester, state: const ComposerState(isTurnRunning: true, isStopping: true));

      expect(
        tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.stop)).onPressed,
        isNull,
      );
    });

    testWidgets('S-29 · with text, send queues and says so, and stop stays beside it', (
      WidgetTester tester,
    ) async {
      await pump(tester, state: const ComposerState(isTurnRunning: true));

      await tester.enterText(field(), 'and the tests?');
      await tester.pump();

      expect(find.byTooltip(l10n.composerQueue), findsOneWidget);
      expect(find.byTooltip(l10n.composerStop), findsOneWidget);
      expect(find.text(l10n.composerQueued), findsOneWidget);

      await tester.tap(find.byTooltip(l10n.composerQueue));
      expect(sent, <String>['and the tests?']);
    });

    testWidgets('S-29 · a session that ended has no stop, and send says it resumes', (
      WidgetTester tester,
    ) async {
      await pump(tester, state: const ComposerState(isTurnRunning: true, isClosed: true));

      expect(find.byTooltip(l10n.composerStop), findsNothing);
      expect(find.byTooltip(l10n.sessionEndedResumeAndSend), findsOneWidget);
      expect(find.text(l10n.composerQueued), findsNothing);
    });
  });

  testWidgets('S-23 · sixty lines: the box grows to 40 % of the height left, and scrolls inside', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pump(tester);

    final double oneLine = tester.getSize(field()).height;
    await tester.enterText(field(), List<String>.generate(60, (int i) => 'line $i').join('\n'));
    await tester.pump();

    final double grown = tester.getSize(field()).height;
    expect(grown, greaterThan(oneLine));
    expect(grown, lessThanOrEqualTo(640 * boxShare));
    expect(tester.takeException(), isNull);
  });

  group('the width of the bar — D-06', () {
    testWidgets('S-30 · narrow: model, effort and context go to ⋯, the rest stays', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pump(
        tester,
        choices: <ComposerChoice>[
          choiceOf('Model', 'A model with a long name', opened),
          choiceOf('Effort', 'Extra high', opened),
          choiceOf('Context', '25%', opened, compact: true),
        ],
      );

      expect(find.byTooltip(l10n.composerSlash), findsOneWidget);
      expect(find.text('Ask me'), findsOneWidget);
      expect(find.byTooltip(l10n.sessionPromptAction), findsOneWidget);
      expect(find.text('A model with a long name'), findsNothing);

      await tester.tap(find.byTooltip(l10n.composerMore));
      await tester.pumpAndSettle();
      expect(find.text('A model with a long name'), findsOneWidget);

      await tester.tap(find.text('Effort'));
      await tester.pumpAndSettle();
      expect(opened, <String>['Effort']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('S-30 · at 200 % the same bar that fits at 100 % moves its choices to ⋯', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(600, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await pump(tester);
      expect(find.text('Sonnet'), findsOneWidget);
      expect(find.byTooltip(l10n.composerMore), findsNothing);

      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pump(tester);

      expect(find.text('Sonnet'), findsNothing);
      expect(find.byTooltip(l10n.composerMore), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    test('the measure: icon buttons, chips and the gaps between them', () {
      final List<ComposerChoice> chips = <ComposerChoice>[
        ComposerChoice(label: 'a', value: 'x', compact: true, onOpen: () {}),
      ];

      // Two icon buttons and a compact chip: three targets of 48 and three gaps of 4.
      expect(
        barFits(width: 156, fixed: 2, chips: chips, style: null, scaler: TextScaler.noScaling),
        isTrue,
      );
      expect(
        barFits(width: 155, fixed: 2, chips: chips, style: null, scaler: TextScaler.noScaling),
        isFalse,
      );
    });
  });
}
