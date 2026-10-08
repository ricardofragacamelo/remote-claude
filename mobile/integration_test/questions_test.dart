/// Plan 24, F6 — a question of Claude in the real app, against the real backend.
///
/// The same recorded turn the Playwright suite answers through the browser
/// (`e2e/specs/structured-questions.spec.ts`), read from the same file in `e2e/scenarios/`: the phone
/// answers it by the steps of its card and the answers leave as answers, by question; refuses it
/// with a reason; and shows answered a question the browser answered.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/features/permission/permission.dart';

import 'support/browser_turns.dart';
import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();
  final E2eScenario questions = E2eScenario.named('questions');

  /// Taps the option, or the button, that says [label] on the card.
  Future<void> tapLabel(WidgetTester tester, String label) async {
    await tapOnScreen(tester, find.textContaining(label).first);
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// The field of the card labelled [label] — never the composer under the conversation, which is a
  /// text field too.
  Finder fieldLabelled(String label) => find.widgetWithText(TextField, label);

  /// The answers of the scenario — two sections, a format, and a tone in words — as they leave.
  final List<Object?> answers = <Object?>[
    <String, Object?>{'questionId': 'q1', 'selected': questions.texts('sections')},
    <String, Object?>{
      'questionId': 'q2',
      'selected': <Object?>[questions.text('format')],
    },
    <String, Object?>{
      'questionId': 'q3',
      'selected': <Object?>[],
      'other': questions.text('otherText'),
    },
  ];

  /// A phone watching the session the browser opened, for this scenario.
  Future<(SignedInApp, BrowserSocket, String)> watching(WidgetTester tester) =>
      watchingTheBrowser(tester, config, questions);

  /// The browser asks; the phone, with its question in view, does [steps] on the card.
  ///
  /// @returns the app, and the payload of the settlement
  Future<(SignedInApp, Map<String, Object?>)> answeredBy(
    WidgetTester tester,
    Future<void> Function(SignedInApp app) steps,
  ) async {
    final (SignedInApp app, BrowserSocket browser, String sessionId) = await watching(tester);
    final Map<String, Object?> resolved = await answeredOnThePhone(
      tester,
      app,
      browser,
      sessionId,
      questions.text('fixture'),
      (String _) async {
        await app.robot(tester).openQuestions();
        await steps(app);
      },
    );

    return (app, resolved);
  }

  /// The tone answered in words is on the line of the question, in the conversation.
  Future<void> seeTheOtherAnswer(WidgetTester tester, SignedInApp app) => app
      .robot(tester)
      .seeInConversation(
        find.text(app.l10n.permissionQuestionOtherAnswer(questions.text('otherText'))),
      );

  testWidgets('${questions.id} — answered by the steps of the card (S-109)', (
    WidgetTester tester,
  ) async {
    final (SignedInApp app, Map<String, Object?> resolved) = await answeredBy(tester, (
      SignedInApp app,
    ) async {
      for (final String section in questions.texts('sections')) {
        await tapLabel(tester, section);
      }
      await tapLabel(tester, app.l10n.permissionQuestionNext);
      // A single choice that is not the last goes on by itself.
      await tapLabel(tester, questions.text('format'));
      await tapLabel(tester, app.l10n.permissionQuestionOther);
      await tester.enterText(
        fieldLabelled(app.l10n.permissionQuestionOther),
        questions.text('otherText'),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tapLabel(tester, app.l10n.permissionQuestionSubmit);
    });

    expect(
      resolved,
      allOf(containsPair('decision', 'allow'), containsPair('resolvedFrom', 'mobile')),
    );
    expect(resolved['answers'], answers);
    await seeTheOtherAnswer(tester, app);
  });

  testWidgets('${questions.id} — refused with a reason (S-110)', (WidgetTester tester) async {
    final (_, Map<String, Object?> resolved) = await answeredBy(tester, (SignedInApp app) async {
      await tapLabel(tester, app.l10n.permissionQuestionDecline);
      await tester.enterText(
        fieldLabelled(app.l10n.permissionQuestionDeclineReason),
        questions.text('reason'),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tapLabel(tester, app.l10n.permissionQuestionDeclineConfirm);
    });

    expect(
      resolved,
      allOf(containsPair('decision', 'deny'), containsPair('resolvedFrom', 'mobile')),
    );
    expect(resolved.containsKey('answers'), isFalse);
  });

  testWidgets('${questions.id} — answered in the browser, shown answered on the phone (S-110)', (
    WidgetTester tester,
  ) async {
    final (SignedInApp app, BrowserSocket browser, String sessionId) = await watching(tester);

    await turnFromTheBrowser(
      browser,
      sessionId,
      questions.text('fixture'),
      whileRunning: () async {
        await pumpUntil(tester, () => app.queueOf(sessionId).pending.isNotEmpty);
        final Map<String, Object?> asked = await browser.waitFor(ofType('permission.requested'));
        browser.respond(asked, <String, Object?>{
          'decision': 'allow',
          'scope': 'once',
          'answers': answers,
        });
        await pumpUntil(tester, () => app.queueOf(sessionId).pending.isEmpty);
      },
    );

    await seeTheOtherAnswer(tester, app);
    expect(find.byType(AnsweredQuestions), findsOneWidget);
  });
}
