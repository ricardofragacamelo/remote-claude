/// The session screen, as the suites drive it — every selector of it, in one place (plan 10, B-04).
///
/// The screen changes phase by phase in plan 10: the composer, the bar, the questions inline. A
/// test that found the box by its type and the send button by its text broke at every one of those
/// changes, in five suites at once (R-01). Here each control is found by what a person — or a
/// screen reader — knows it by: its label, its tooltip, its words. A phase that moves a control
/// changes this file, not the tests, and the tests go on asserting what they always asserted.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'e2e_environment.dart';

/// The session screen — and the draft that becomes one — driven by its semantics.
class SessionRobot {
  SessionRobot(this.tester, this.l10n);

  final WidgetTester tester;
  final AppLocalizations l10n;

  /// The prompt box.
  Finder get box => find.widgetWithText(TextField, l10n.composerBoxLabel);

  /// Send, in each of the shapes it takes: send, add to the queue, resume and send.
  Finder get send => find.byWidgetPredicate(
    (Widget widget) =>
        widget is Tooltip &&
        <String>{
          l10n.sessionPromptAction,
          l10n.composerQueue,
          l10n.sessionEndedResumeAndSend,
        }.contains(widget.message),
  );

  /// Stop, on the composer bar.
  Finder get stop => find.byTooltip(l10n.composerStop);

  /// Resume and send — the only thing the box of a session that ended does (09 · D-05).
  Finder get resumeAndSend => find.byTooltip(l10n.sessionEndedResumeAndSend);

  /// The commands of the installation.
  Finder get commands => find.byTooltip(l10n.composerSlash);

  /// A choice of the bar — the mode, the model, the effort, the context — by its name and value.
  Finder choice(String label, String value) =>
      find.bySemanticsLabel(l10n.composerChoice(label, value));

  /// The pill over the box, while a question is out of view (plan 10, B-22) — the chip that says
  /// Claude waits, whatever the count.
  Finder get pill => find.ancestor(
    of: find.textContaining(l10n.sessionPendingPill('').split('(').first.trim()),
    matching: find.byType(ActionChip),
  );

  /// Scrolls the conversation back until [target] is on screen — the list builds only what is near
  /// the view, so a line further up exists only once somebody scrolls to it, as a person would.
  Future<void> seeInConversation(Finder target) async {
    await tester.scrollUntilVisible(
      target,
      -200,
      scrollable: find
          .descendant(of: find.byType(ConversationView), matching: find.byType(Scrollable))
          .first,
      maxScrolls: 80,
    );
  }

  /// The ⋯ of the bar.
  Finder get menu => find.byTooltip(l10n.sessionMenuOpen);

  /// The folders of the list — tiles **of the list**: the home screen being left has list tiles too
  /// while the transition runs.
  Finder get folders =>
      find.descendant(of: find.byType(WorkspaceListPage), matching: find.byType(ListTile));

  /// The line that says why the session ended — the reason and, after it, that sending resumes it.
  Finder endedBecause(String reason) => find.textContaining(reason);

  /// The session on screen, once there is one.
  String? get sessionOnScreen {
    final Finder page = find.byType(SessionPage);
    return page.evaluate().isEmpty ? null : tester.widget<SessionPage>(page).sessionId;
  }

  /// Whether the box of the session on screen can only resume it.
  bool get canOnlyResume => resumeAndSend.evaluate().isNotEmpty && stop.evaluate().isEmpty;

  /// The folders of the list, once it is on screen.
  Future<Finder> theFolders(ProviderContainer container) async {
    container.read(routerProvider).go(workspacesRoute);
    await pumpUntil(tester, () => folders.evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    return folders;
  }

  /// Opens the draft of the first folder of the list (plan 10, D-05): nothing runs yet.
  Future<void> openDraft(ProviderContainer container) async {
    final Finder found = await theFolders(container);
    await tester.tap(found.first);
    await pumpUntil(tester, () => find.byType(DraftPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
  }

  /// Opens a session on the first folder with [prompt] as its first turn, and answers its id.
  ///
  /// The draft's first send is what opens it: the session is started with the prompt, and the
  /// screen moves to it once the server named it.
  Future<String> startSession(ProviderContainer container, String prompt) async {
    await openDraft(container);
    await write(prompt);
    await tester.tap(send.first);
    // On the session screen, and only on it: the draft leaves while the transition runs, and until
    // it has, the screen has two boxes.
    await pumpUntil(
      tester,
      () => sessionOnScreen != null && find.byType(DraftPage).evaluate().isEmpty,
    );

    return sessionOnScreen!;
  }

  /// Writes [text] in the box, once the box takes it.
  Future<void> write(String text) async {
    await pumpUntil(tester, () => tester.widget<TextField>(box).enabled ?? true);
    await tester.enterText(box, text);
    await tester.pump();
  }

  /// Sends [text] — as a turn, a queued prompt or a resume, whichever the box offers — and waits
  /// for the box to empty, which it does only once the command left.
  Future<void> prompt(String text) async {
    await write(text);
    await tester.ensureVisible(send.first);
    await tester.tap(send.first);
    await pumpUntil(tester, () => tester.widget<TextField>(box).controller?.text.isEmpty ?? true);
  }

  /// Sends whatever the box holds, without waiting for anything.
  Future<void> tapSend() async {
    await tester.ensureVisible(send.first);
    await tester.tap(send.first);
    await tester.pump();
  }

  /// Answers the question on screen with the button that says [label] — the card is in the
  /// conversation, in the place of its tool (B-20); the pill brings it into view when it is away.
  Future<void> answer(String label) async {
    await openQuestions();
    final Finder button = find.text(label).first;
    await tester.ensureVisible(button);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(button);
  }

  /// Brings the oldest question into view when its card is away, by the pill.
  Future<void> openQuestions() async {
    if (pill.evaluate().isNotEmpty) {
      await tester.tap(pill.first);
      await tester.pump(const Duration(milliseconds: 300));
    }
  }

  /// Ends the session from the menu, confirming it (09 · D-10).
  Future<void> endSession() async {
    await tester.tap(menu);
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.sessionMenuEnd));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.sessionCloseConfirm));
    await tester.pumpAndSettle();
  }
}
