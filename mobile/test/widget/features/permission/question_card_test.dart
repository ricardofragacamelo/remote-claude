/// A question of Claude on the phone (plan 24, B-18): one question per step, the way back always in
/// view, "Other", the preview in a sheet, and nothing sent until every question has an answer —
/// through the panel, so what is tapped reaches the controller and the socket for real.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/builders/questions.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;
  late FakePermissionRepository repository;
  late FakeApprovalLock lock;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpQuestion(
    WidgetTester tester, {
    QuestionInteraction interaction = threeQuestions,
    bool hasLock = true,
  }) async {
    repository = FakePermissionRepository();
    lock = FakeApprovalLock(available: hasLock);

    await tester.pumpApp(
      const SingleChildScrollView(child: _Panels()),
      overrides: <Override>[
        ...permissionOverrides(repository: repository, lock: lock, clock: () => t0),
        deviceControllerAnswering(
          AsyncValue<RegisteredDevice?>.data(aRegisteredDevice(status: DeviceStatus.approved)),
        ),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
        ),
      ],
    );
    await tester.pumpAndSettle();
    repository.feed.emit(asked(aQuestionRequest(interaction: interaction), frameId: 'frame-q'));
    await tester.pumpAndSettle();
  }

  bool enabled(WidgetTester tester, String label) =>
      tester
          .widget<ButtonStyleButton>(
            find
                .ancestor(of: find.text(label), matching: find.bySubtype<ButtonStyleButton>())
                .first,
          )
          .onPressed !=
      null;

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  bool checked(WidgetTester tester, String label) {
    final Finder tile = find.ancestor(of: find.text(label), matching: find.byType(ListTile)).first;
    final Finder checkbox = find.descendant(of: tile, matching: find.byType(Checkbox));
    if (checkbox.evaluate().isNotEmpty) {
      return tester.widget<Checkbox>(checkbox).value ?? false;
    }
    final RadioGroup<String> group = tester.widget<RadioGroup<String>>(
      find.byType(RadioGroup<String>),
    );
    return group.groupValue == label;
  }

  testWidgets('S-86 · a single choice is radios, and one question answered sends', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester, interaction: const QuestionInteraction(questions: <Question>[tone]));

    expect(find.byType(RadioListTile<String>), findsNWidgets(3));
    expect(enabled(tester, l10n.permissionQuestionSubmit), isFalse);

    await tap(tester, find.text('Friendly'));
    expect(checked(tester, 'Friendly'), isTrue);
    expect(enabled(tester, l10n.permissionQuestionSubmit), isTrue);

    await tap(tester, find.text(l10n.permissionQuestionSubmit));
    expect(repository.feed.answers.single.answers, const <QuestionAnswer>[
      QuestionAnswer(questionId: 'q3', selected: <String>['Friendly']),
    ]);
  });

  testWidgets('S-87 · a multiple choice is checkboxes that toggle, and stays', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);

    await tap(tester, find.text('Usage'));
    await tap(tester, find.text('License'));
    await tap(tester, find.text('Usage'));

    expect(checked(tester, 'Usage'), isFalse);
    expect(checked(tester, 'License'), isTrue);
    expect(find.text(l10n.permissionQuestionProgress(1, 3)), findsOneWidget);
  });

  testWidgets('S-88 · "Other" opens its field with the focus, and empty it is no answer', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester, interaction: const QuestionInteraction(questions: <Question>[tone]));

    await tap(tester, find.text(l10n.permissionQuestionOther).last);
    final Finder field = find.byType(TextField);
    expect(tester.widget<TextField>(field).autofocus, isTrue);
    expect(enabled(tester, l10n.permissionQuestionSubmit), isFalse);

    await tester.enterText(field, '   ');
    await tester.pumpAndSettle();
    expect(enabled(tester, l10n.permissionQuestionSubmit), isFalse);

    await tester.enterText(field, 'very formal');
    await tester.pumpAndSettle();
    await tap(tester, find.text(l10n.permissionQuestionSubmit));
    expect(repository.feed.answers.single.answers, const <QuestionAnswer>[
      QuestionAnswer(questionId: 'q3', selected: <String>[], other: 'very formal'),
    ]);
  });

  testWidgets('S-89 · the questions go in steps, the answered ones marked, and fit 360 dp', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pumpQuestion(tester);

    expect(find.text(l10n.permissionQuestionProgress(1, 3)), findsOneWidget);
    await tap(tester, find.text('Usage'));
    expect(find.bySemanticsLabel(l10n.permissionQuestionAnswered), findsOneWidget);

    await tap(tester, find.text(l10n.permissionQuestionNext));
    expect(find.text(l10n.permissionQuestionProgress(2, 3)), findsOneWidget);
    expect(find.bySemanticsLabel(l10n.permissionQuestionAnswered), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('S-90 · a single choice that is not the last goes on, and Back brings it back', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);

    await tap(tester, find.text(l10n.permissionQuestionNext));
    await tap(tester, find.text('Plain list'));
    expect(find.text(l10n.permissionQuestionProgress(3, 3)), findsOneWidget);
    expect(find.text(l10n.permissionQuestionBack), findsOneWidget);

    await tap(tester, find.text('Friendly'));
    expect(find.text(l10n.permissionQuestionProgress(3, 3)), findsOneWidget);

    await tap(tester, find.text(l10n.permissionQuestionBack));
    expect(find.text(l10n.permissionQuestionProgress(2, 3)), findsOneWidget);
    expect(checked(tester, 'Plain list'), isTrue);
  });

  testWidgets('S-91 · nothing is sent until every question has an answer', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);

    await tap(tester, find.text('License'));
    expect(enabled(tester, l10n.permissionQuestionSubmit), isFalse);
    await tap(tester, find.text(l10n.permissionQuestionNext));
    await tap(tester, find.text('Classic prose'));
    expect(enabled(tester, l10n.permissionQuestionSubmit), isFalse);
    await tap(tester, find.text('Professional (Recommended)'));
    expect(enabled(tester, l10n.permissionQuestionSubmit), isTrue);

    await tap(tester, find.text(l10n.permissionQuestionSubmit));
    expect(repository.feed.answers.single.answers, const <QuestionAnswer>[
      QuestionAnswer(questionId: 'q1', selected: <String>['License']),
      QuestionAnswer(questionId: 'q2', selected: <String>['Classic prose']),
      QuestionAnswer(questionId: 'q3', selected: <String>['Professional (Recommended)']),
    ]);
  });

  testWidgets('S-92 · "See preview" opens the preview, monospaced; a multiple choice has none', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);
    expect(find.text(l10n.permissionQuestionSeePreview), findsNothing);

    await tap(tester, find.text(l10n.permissionQuestionNext));
    expect(find.text(l10n.permissionQuestionSeePreview), findsNWidgets(2));

    await tap(tester, find.text(l10n.permissionQuestionSeePreview).at(1));
    final SelectableText preview = tester.widget<SelectableText>(
      find.byWidgetPredicate(
        (Widget widget) => widget is SelectableText && (widget.data ?? '').contains('<div'),
      ),
    );
    expect(preview.style?.fontFamily, 'monospace');
    expect(find.text(l10n.permissionQuestionPreview), findsOneWidget);
  });

  testWidgets('D-23 · the recommended option is marked, and not chosen', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester, interaction: const QuestionInteraction(questions: <Question>[tone]));

    expect(find.text(l10n.permissionQuestionRecommended), findsOneWidget);
    expect(checked(tester, 'Professional (Recommended)'), isFalse);
  });

  testWidgets('S-93 · "Don\'t answer" takes an optional reason, and goes as a refusal', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);

    await tap(tester, find.text(l10n.permissionQuestionDecline));
    await tap(tester, find.text(l10n.permissionQuestionDeclineBack));
    expect(find.text(l10n.permissionQuestionProgress(1, 3)), findsOneWidget);

    await tap(tester, find.text(l10n.permissionQuestionDecline));
    await tester.enterText(find.byType(TextField), 'later');
    await tap(tester, find.text(l10n.permissionQuestionDeclineConfirm));

    expect(repository.feed.answers.single.decision, PermissionDecision.deny);
    expect(repository.feed.answers.single.reason, 'later');
  });

  testWidgets('S-93 · it counts down and extends like any card; unreadable, it only refuses', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester, interaction: QuestionInteraction.unreadable);

    expect(find.text(l10n.permissionQuestionMalformed), findsOneWidget);
    expect(find.text(l10n.permissionQuestionSubmit), findsNothing);
    expect(find.text(l10n.permissionRemaining(600)), findsOneWidget);

    await tap(tester, find.text(l10n.permissionExtend));
    expect(repository.feed.extensions, <String>['request-q']);

    await tap(tester, find.text(l10n.permissionQuestionDecline));
    expect(repository.feed.answers.single.decision, PermissionDecision.deny);
  });

  testWidgets('S-85 · a phone with no lock answers a question, with no second step', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(
      tester,
      hasLock: false,
      interaction: const QuestionInteraction(questions: <Question>[tone]),
    );

    await tap(tester, find.text('Friendly'));
    await tap(tester, find.text(l10n.permissionQuestionSubmit));

    expect(repository.feed.answers, hasLength(1));
    expect(lock.asked, isEmpty);
    expect(find.text(l10n.permissionConfirmTitle), findsNothing);
  });

  testWidgets('a draft survives the question republished after a reconnect — S-84', (
    WidgetTester tester,
  ) async {
    await pumpQuestion(tester);

    await tap(tester, find.text('Usage'));
    repository.feed.emit(const PermissionFeedReset());
    repository.feed.emit(asked(aQuestionRequest(), frameId: 'frame-q2'));
    await tester.pumpAndSettle();

    expect(checked(tester, 'Usage'), isTrue);
  });
}

/// The open questions of the session, each as the panel the conversation and the push screen draw.
class _Panels extends ConsumerWidget {
  const _Panels();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final PermissionQueue queue = ref.watch(permissionQueueControllerProvider('session-1'));

    return Column(
      children: <Widget>[
        for (final PermissionCard card in queue.pending)
          PermissionPanel(sessionId: 'session-1', card: card, now: queue.asOf ?? t0),
      ],
    );
  }
}
