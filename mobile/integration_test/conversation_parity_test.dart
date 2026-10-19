/// Plan 26, F7 — B-29: the conversation parity proved through the screen, on a device, against the
/// scripted backend — not just the widget tests of F2…F6.
///
/// One session, one fixture of plan 26's B-02 per turn (plus `ansi-output-turn` of F7, B-29, the one
/// with real colour none of the five carries): the table, the code and the Mermaid of
/// `markdown-rich-turn`; the raw name of `mcp-untitled-tool-turn`'s tool; `subagent-permission-turn`'s
/// own text, with its permission answered from inside its own card; `ansi-output-turn`'s colour;
/// `edit-turn`'s diff, read live from the backend's own route; the trail of a tool; the turn's
/// tokens; and "Copy message" on the clipboard. Then the same session, reopened from its history,
/// with the subagent's own text loaded once its card opens.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/widgets/markdown/code_block.dart';
import 'package:remote_claude/core/widgets/markdown/mermaid_block.dart';
import 'package:remote_claude/features/audit/audit.dart';
import 'package:remote_claude/features/session/presentation/widgets/ansi_text.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_lines.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_diff_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/working_indicator.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario parity = E2eScenario.named('mobile-conversation-parity');
  final BuildConfig config = e2eConfig();

  String turnOf(String fixture) => 'do the work [fixture:$fixture]';

  /// [target], inside the conversation on screen.
  Finder said(Finder target) =>
      find.descendant(of: find.byType(ConversationView), matching: target);

  /// Opens the folded row whose own title is [rowLabel] — the one tap target of the whole line
  /// (`FoldLine`'s `InkWell`), scrolled into view first.
  Future<void> openRow(WidgetTester tester, SessionRobot robot, Finder rowLabel) async {
    await robot.seeInConversation(said(rowLabel));
    final Finder icon = find.descendant(
      of: find.ancestor(of: rowLabel, matching: find.byType(FoldLine)).first,
      matching: find.byIcon(Icons.expand_more),
    );
    await tester.tap(icon.first);
    await tester.pumpAndSettle();
  }

  testWidgets('${parity.id} — ${parity.title}', (WidgetTester tester) async {
    final List<String> copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      MethodCall call,
    ) async {
      if (call.method == 'Clipboard.setData') {
        copied.add((call.arguments! as Map<Object?, Object?>)['text']! as String);
      }
      return null;
    });

    final SignedInApp app = await anApprovedApp(tester, config, parity);
    final SessionRobot robot = app.robot(tester);

    int turnsOf(String sessionId) =>
        app.conversationOf(sessionId).entries.whereType<TurnSummary>().length;

    Future<void> aTurn(String sessionId, String fixture) async {
      final int before = turnsOf(sessionId);
      await tester.pumpAndSettle();
      await robot.prompt(turnOf(fixture));
      await pumpUntil(tester, () => turnsOf(sessionId) > before);
      // The working line over the composer is gone a moment after the turn itself ends.
      await pumpUntil(tester, () => find.byType(WorkingIndicator).evaluate().isEmpty);
      await tester.pumpAndSettle();
    }

    // markdown-rich-turn — the answer alone: a table, highlighted code, a Mermaid block, and
    // "Copy message" putting the same markdown on the clipboard (S-84).
    final String sessionId = await robot.startSession(app.container, turnOf('markdown-rich-turn'));
    app.endsAfterTheTest(config, sessionId);
    await pumpUntil(tester, () => turnsOf(sessionId) == 1);
    await pumpUntil(tester, () => find.byType(WorkingIndicator).evaluate().isEmpty);
    await tester.pumpAndSettle();

    await robot.seeInConversation(said(find.byType(Table)));
    await robot.seeInConversation(said(find.byType(CodeBlock)));
    await robot.seeInConversation(said(find.byType(MermaidBlock)));

    final String answer = app
        .conversationOf(sessionId)
        .entries
        .whereType<StreamMessage>()
        .firstWhere((StreamMessage message) => !message.isFromUser)
        .text;
    final Finder copyButton = said(find.byTooltip(app.l10n.sessionMessageCopy));
    await robot.seeInConversation(copyButton);
    await tester.tap(copyButton.first);
    expect(copied, contains(answer));
    // The snackbar sits exactly over the composer — this build never gives the Scaffold a
    // bottom-aware slot for it — so neither a wait nor a swipe ever reaches it; it goes through
    // the messenger that opened it, the same door a screen that wanted it gone would use.
    await tester.pump();
    ScaffoldMessenger.of(tester.element(find.byType(ConversationView))).hideCurrentSnackBar();
    await tester.pumpAndSettle();

    // mcp-untitled-tool-turn — the tool's own name, never a title it never had: labelled by its
    // server and its tool (plan 28, B-19; plan 26, S-48).
    await aTurn(sessionId, 'mcp-untitled-tool-turn');
    await robot.seeInConversation(said(find.textContaining('fixture · echo')));
    await tester.pumpAndSettle();

    // subagent-permission-turn — its own text, and the permission of its own Write answered from
    // inside its own card, never at the top level (plan 26, B-19…B-21). A card whose own
    // tool.started has not arrived yet draws at the tail, same as S-63 — opening the subagent's
    // own row is what moves it to its nested place (session_inline_test.dart's S-71).
    await robot.prompt(turnOf('subagent-permission-turn'));
    final String requestId = await cardRequestIdOnScreen(tester, app, sessionId);
    await openRow(
      tester,
      robot,
      find.textContaining(app.l10n.sessionToolAgent('writer', 'Write file from-subagent.txt')),
    );
    expect(robot.cardInConversation, findsOneWidget);
    await app.robot(tester).answer(app.l10n.permissionScopeOnce);
    await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(requestId) != null);
    await pumpUntil(tester, () => turnsOf(sessionId) == 3);
    await tester.pumpAndSettle();
    await robot.seeInConversation(said(find.textContaining('from-subagent.txt')));

    // ansi-output-turn — real colour, not a stripped-plain line (plan 26, B-15; F7, B-29). The
    // folded row shows the description Claude gave the call, never the command itself (B-13).
    await aTurn(sessionId, 'ansi-output-turn');
    await openRow(tester, robot, find.textContaining('Print styled text sample'));
    await robot.seeInConversation(said(find.byType(AnsiText)));

    // edit-turn — a diff of a real edit, read live from the backend's own route (plan 26, B-16).
    // `app.js` is read twice before either edit — "Edit " picks one of its own two, not a read.
    await aTurn(sessionId, 'edit-turn');
    await openRow(tester, robot, find.textContaining('Edit /workspace/app.js'));
    await robot.seeInConversation(said(find.byType(ToolDiffView)));

    // The tokens of the turn that just ended, and the trail of the mcp tool's own kind.
    await robot.seeInConversation(said(find.byType(TurnLine)));
    await openRow(tester, robot, find.textContaining('fixture · echo'));
    final Finder trail = said(find.text(app.l10n.sessionToolRowTrail));
    await robot.seeInConversation(trail);
    await tester.tap(trail.first);
    await pumpUntil(tester, () => find.byType(AuditTrailPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    expect(find.byType(AuditTrailPage), findsOneWidget);
    Navigator.of(tester.element(find.byType(AuditTrailPage))).pop();
    await tester.pumpAndSettle();

    // Reopened from the history: the subagent's own text loaded once its card is opened (plan 26,
    // B-20) — a session of its own, a single turn, since the history pages from the most recent
    // turn backward and the one of the long session above would be its own page by now.
    final String subagentSessionId = await robot.startSession(
      app.container,
      turnOf('subagent-permission-turn'),
    );
    app.endsAfterTheTest(config, subagentSessionId);
    final String subagentRequestId = await cardRequestIdOnScreen(tester, app, subagentSessionId);
    await openRow(
      tester,
      robot,
      find.textContaining(app.l10n.sessionToolAgent('writer', 'Write file from-subagent.txt')),
    );
    await app.robot(tester).answer(app.l10n.permissionScopeOnce);
    await pumpUntil(
      tester,
      () => app.queueOf(subagentSessionId).outcomeOf(subagentRequestId) != null,
    );
    await pumpUntil(
      tester,
      () => app.conversationOf(subagentSessionId).entries.whereType<TurnSummary>().isNotEmpty,
    );
    await tester.pumpAndSettle();

    final ConversationKey key = app.conversationOf(subagentSessionId).facts.conversation!;
    final String workspace = app.conversationOf(subagentSessionId).facts.workspacePath!;
    app.container.read(routerProvider).go(conversationRouteFor(key, workspace));
    await pumpUntil(tester, () => find.byType(ConversationHistoryPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();

    await openRow(
      tester,
      robot,
      find.textContaining(app.l10n.sessionToolAgent('writer', 'Write file from-subagent.txt')),
    );
    await robot.seeInConversation(find.textContaining('from-subagent.txt'));
  });
}
