/// Plan 27, F8 — B-26: the same roadmap the web proves (B-25) through the app's own screens — a
/// `/compact` with no ghost bubble and its summary behind a fold, a failed hook's own warning, an
/// MCP tool's image in its card with its `resource_link` as plain text, a tool a rule denied with
/// its reason, and the generic line of a variant this build has never seen — live, and the same
/// again once the conversation is reopened from its history.
///
/// Cenário S-104.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/conversation_robot.dart';
import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario scenario = E2eScenario.named('conversation-losses');
  final BuildConfig config = e2eConfig();

  /// Opens a notice row by its title text — `NoticeRow` is its own `InkWell`, not a `FoldLine`.
  Future<void> openNotice(WidgetTester tester, SessionRobot robot, Finder titleText) async {
    await robot.seeInConversation(inTheConversation(titleText));
    await tester.tap(find.ancestor(of: titleText, matching: find.byType(InkWell)).first);
    await tester.pumpAndSettle();
  }

  testWidgets('${scenario.id} — the plan proven through the screen, live and from the history', (
    WidgetTester tester,
  ) async {
    final SignedInApp app = await anApprovedApp(tester, config, scenario);
    final SessionRobot robot = app.robot(tester);

    Future<void> waitForTurns(String sessionId, int total) async {
      await pumpUntil(tester, () => turnsOf(app, sessionId) >= total);
      await tester.pumpAndSettle();
    }

    // `compact-turn` answers the prompt and then compacts in the same recording — two turns.
    final String sessionId = await robot.startSession(app.container, turnOf('compact-turn'));
    app.endsAfterTheTest(config, sessionId);
    await waitForTurns(sessionId, 2);

    await robot.prompt(turnOf('hook-message-turn'));
    await app.robot(tester).cardOnScreen();
    await app.robot(tester).answer(app.l10n.permissionScopeOnce);
    await waitForTurns(sessionId, 3);

    await robot.prompt(turnOf('mcp-media-result-turn'));
    await app.robot(tester).cardOnScreen();
    await app.robot(tester).answer(app.l10n.permissionScopeOnce);
    await waitForTurns(sessionId, 4);

    await robot.prompt(turnOf('denied-by-rule-turn'));
    await waitForTurns(sessionId, 5);

    await robot.prompt(turnOf('unknown-variant-turn'));
    await waitForTurns(sessionId, 6);

    Future<void> expectTheConversation() async {
      // No ghost "You" bubble for the compaction's own synthetic summary (B-21).
      for (final StreamMessage message
          in app.conversationOf(sessionId).entries.whereType<StreamMessage>()) {
        expect(message.text, isNot(contains(scenario.text('compactSummarySnippet'))));
      }

      // The compaction row, folded with its summary behind "See summary" (B-18, B-21).
      final Finder compacted = inTheConversation(find.textContaining('Compacted on request'));
      await openFoldRow(tester, robot, compacted);
      await robot.seeInConversation(
        inTheConversation(find.textContaining(scenario.text('compactSummarySnippet'))),
      );

      // The compaction's own command echo, as a `command.output` notice (B-09, B-11).
      await robot.seeInConversation(inTheConversation(find.text('Command output')));

      // A failed hook's own warning — folded under the generic title every `agent.info` notice
      // shares (D-10); the harmless hook of the same recording shares the title, so the body is
      // what tells them apart.
      final Finder agentNotices = inTheConversation(find.text('A message from the agent'));
      await robot.seeInConversation(agentNotices);
      expect(agentNotices, findsNWidgets(2));
      await openNotice(tester, robot, agentNotices.last);
      await robot.seeInConversation(
        inTheConversation(find.textContaining(scenario.text('hookFailureSnippet'))),
      );

      // The MCP tool's own image, in its card, and its `resource_link` flattened to plain text
      // alongside it (F4 · B-14) — never a clickable link.
      final Finder mcpTool = inTheConversation(find.textContaining(scenario.text('mcpToolLabel')));
      await openFoldRow(tester, robot, mcpTool);
      await robot.seeInConversation(inTheConversation(find.text(app.l10n.sessionImageOpen)));
      await robot.seeInConversation(inTheConversation(find.textContaining('linked.txt')));

      // A tool a project's own rule denied, with the reason it was denied (B-10).
      final Finder denied = inTheConversation(find.textContaining('Create an empty file'));
      await openFoldRow(tester, robot, denied);
      await robot.seeInConversation(
        inTheConversation(find.textContaining(scenario.text('deniedReasonSnippet'))),
      );

      // A variant this build has never seen draws the one generic line, instead of vanishing
      // (B-13, B-20) — and the turn after it still completed normally.
      final Finder unknown = inTheConversation(find.textContaining('nunca_visto'));
      await openNotice(tester, robot, unknown);
      await robot.seeInConversation(
        inTheConversation(find.textContaining(scenario.text('unknownLineSnippet'))),
      );
    }

    await expectTheConversation();

    await reopenFromHistory(tester, app, sessionId);

    await expectTheConversation();
  });
}
