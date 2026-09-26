/// What a session shows: the messages, the tools, and what the turn cost.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('shows both sides of the conversation, and what a turn cost', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          messages: <StreamMessage>[
            StreamMessage(messageId: 'm1', text: 'run the tests', isFromUser: true),
            StreamMessage(messageId: 'm2', text: 'running them now'),
          ],
          lastTurn: TurnSummary(turnId: 'turn-1', costUsd: '0.2740', durationMs: 4200),
        ),
      ),
    );

    expect(find.text('run the tests'), findsOneWidget);
    expect(find.text('running them now'), findsOneWidget);

    // Somebody's own money, spent by a process they started from a phone: it should not take a
    // dashboard to find out.
    expect(find.text(l10n.sessionTurnCost('0.2740', 4200)), findsOneWidget);
  });

  testWidgets('a message from the person sits on the other side of the screen', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          messages: <StreamMessage>[StreamMessage(messageId: 'm1', text: 'mine', isFromUser: true)],
        ),
      ),
    );

    final Align align = tester.widget<Align>(
      find.ancestor(of: find.text('mine'), matching: find.byType(Align)).first,
    );

    expect(align.alignment, AlignmentDirectional.centerEnd);
  });

  testWidgets('shows every tool of the session', (WidgetTester tester) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          tools: <ToolExecution>[
            ToolExecution(toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
            ToolExecution(toolUseId: 't2', toolName: 'Read', input: <String, Object?>{}),
          ],
        ),
      ),
    );

    expect(find.byType(ToolCard), findsNWidgets(2));
  });
}
