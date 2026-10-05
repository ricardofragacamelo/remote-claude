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
import 'package:remote_claude/features/permission/permission.dart';
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

  /// A chip of the bar by its name alone, whatever it says now — its tooltip is "name: value".
  Finder chip(String label) => find.byWidgetPredicate(
    (Widget widget) => widget is Tooltip && (widget.message ?? '').startsWith('$label: '),
  );

  /// Opens the choice [label] — its chip, or its row under the `⋯` of the bar when the bar has no
  /// room for it (plan 10, B-10) — and picks [option] in its sheet.
  Future<void> pick(String label, String option) async {
    await _open(label);
    // The sheet may still be reading what it offers — the models come from the installation.
    final Finder offered = find.descendant(
      of: find.byType(BottomSheet),
      matching: find.text(option),
    );
    await pumpUntil(tester, () => offered.evaluate().isNotEmpty, what: () => '"$option" in $label');
    await tester.pumpAndSettle();
    await tester.tap(offered.last);
    await tester.pumpAndSettle();
  }

  /// What the choice [label] says now — on its chip, or under the `⋯` of the bar.
  Future<String> valueOf(String label) async {
    final Finder onTheBar = chip(label);

    if (onTheBar.evaluate().isNotEmpty) {
      return tester.widget<Tooltip>(onTheBar.first).message!.substring('$label: '.length);
    }

    await tester.tap(find.byTooltip(l10n.composerMore));
    await tester.pumpAndSettle();
    final ListTile row = tester.widget<ListTile>(
      find.ancestor(of: find.text(label), matching: find.byType(ListTile)).last,
    );
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    return (row.subtitle! as Text).data!;
  }

  Future<void> _open(String label) async {
    if (chip(label).evaluate().isNotEmpty) {
      await tester.tap(chip(label).first);
      return;
    }

    await tester.tap(find.byTooltip(l10n.composerMore));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(BottomSheet), matching: find.text(label)).last,
    );
    await tester.pumpAndSettle();
  }

  /// The card of a question, in the conversation — in the place of its tool, or at its end (B-20).
  Finder get cardInConversation =>
      find.descendant(of: find.byType(ConversationView), matching: find.byType(PermissionPanel));

  /// The pill over the box, while a question is out of view (plan 10, B-22) — the chip that says
  /// Claude waits, whatever the count.
  Finder get pill => find.ancestor(
    of: find.textContaining(l10n.sessionPendingPill('').split('(').first.trim()),
    matching: find.byType(ActionChip),
  );

  /// Scrolls the conversation until [target] is on screen — the list builds only what is near
  /// the view, so a line further up exists only once somebody scrolls to it, as a person would.
  ///
  /// When it is not there at all, the failure lists what the conversation does say.
  Future<void> seeInConversation(Finder target) async {
    final Finder scroller = find
        .descendant(of: find.byType(ConversationView), matching: find.byType(Scrollable))
        .first;
    final ScrollableState state = tester.state<ScrollableState>(scroller);

    // From the end, then up: wherever the screen was left, nothing below it is skipped. The end
    // of a lazy list moves as it is built, so it is reached again until it holds.
    for (int step = 0; step < 5 && target.evaluate().isEmpty; step += 1) {
      state.position.jumpTo(state.position.maxScrollExtent);
      await tester.pump();
    }

    for (int step = 0; step < 80 && target.evaluate().isEmpty; step += 1) {
      if (state.position.pixels <= state.position.minScrollExtent) {
        break;
      }
      state.position.jumpTo(
        (state.position.pixels - 200).clamp(state.position.minScrollExtent, double.infinity),
      );
      await tester.pump();
    }

    if (target.evaluate().isEmpty) {
      final Iterable<String> said = tester
          .widgetList<Text>(
            find.descendant(of: find.byType(ConversationView), matching: find.byType(Text)),
          )
          .map((Text text) => text.data ?? text.textSpan?.toPlainText() ?? '');
      fail('$target is not in the conversation, which says: ${said.join(' | ')}');
    }

    await tester.ensureVisible(target.first);
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// The ⋯ of the bar.
  Finder get menu => find.byTooltip(l10n.sessionMenuOpen);

  /// The roots of the picker — tiles **of the picker**: the folders home being left has list tiles
  /// too while the transition runs.
  Finder get folders =>
      find.descendant(of: find.byType(WorkspaceListPage), matching: find.byType(ListTile));

  /// The line that says why the session ended — the reason and, after it, that sending resumes it.
  Finder endedBecause(String reason) => find.textContaining(reason);

  /// The session on screen, once there is one — the top of the stack: another session of the folder
  /// can be under it (plan 10, F9).
  String? get sessionOnScreen {
    final Iterable<SessionPage> pages = tester.widgetList<SessionPage>(find.byType(SessionPage));
    return pages.isEmpty ? null : pages.last.sessionId;
  }

  /// Whether the box of the session on screen can only resume it.
  bool get canOnlyResume => resumeAndSend.evaluate().isNotEmpty && stop.evaluate().isEmpty;

  /// The roots of the picker, once it is on screen — the first level of "open another folder".
  Future<Finder> theFolders(ProviderContainer container) async {
    container.read(routerProvider).go(workspacesRoute);
    await pumpUntil(tester, () => folders.evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    return folders;
  }

  /// Opens the first root of the picker as a folder (plan 10, F7) — here and in the browser's tabs
  /// — and waits on its screen (F8). Answers the folder.
  Future<String> openFolder(ProviderContainer container) async {
    final Finder roots = await theFolders(container);
    await tester.tap(roots.first);
    await pumpUntil(tester, () => find.text(l10n.folderPickerOpenThis).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.folderPickerOpenThis));

    return onFolderScreen();
  }

  /// Waits for the screen of a folder, and answers which folder it is.
  Future<String> onFolderScreen() async {
    await pumpUntil(tester, () => find.byType(FolderPage).hitTestable().evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    return tester.widget<FolderPage>(find.byType(FolderPage)).workspacePath;
  }

  /// "New session" on the folder's screen — on once the socket is up (F8).
  Finder get newSession => find.ancestor(
    of: find.descendant(of: find.byType(FolderPage), matching: find.text(l10n.folderNewSession)),
    matching: find.bySubtype<ButtonStyleButton>(),
  );

  /// Opens the draft of the first folder of the picker (plan 10, D-05): nothing runs yet.
  Future<void> openDraft(ProviderContainer container) async {
    await openFolder(container);
    await pumpUntil(tester, () => tester.widget<ButtonStyleButton>(newSession).onPressed != null);
    await tester.tap(newSession);
    await pumpUntil(tester, () => find.byType(DraftPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
  }

  /// Opens a session on the first folder with [prompt] as its first turn, and answers its id.
  ///
  /// The draft's first send is what opens it: the session is started with the prompt, and the
  /// screen moves to it once the server named it.
  Future<String> startSession(ProviderContainer container, String prompt) async {
    await openDraft(container);
    return sentFromTheDraft(prompt);
  }

  /// Sends [prompt] from the draft on screen, and answers the session it opened.
  Future<String> sentFromTheDraft(String prompt) async {
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

  /// Waits for the card of a question in the conversation, where a tap reaches it.
  Future<void> cardOnScreen() =>
      pumpUntil(tester, () => cardInConversation.hitTestable().evaluate().isNotEmpty);

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
