/// What a session shows, in the order it happened — and the one scroll of the screen, which follows
/// the end only for somebody already at the end (plan 10, B-05, B-06).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

/// A conversation of [count] answers, one after the other.
Conversation longConversation(int count, {String last = 'answer'}) => Conversation(
  entries: <ConversationEntry>[
    for (int index = 0; index < count; index += 1)
      StreamMessage(
        messageId: 'm$index',
        blocks: <String>[index == count - 1 ? last : 'answer number $index'],
      ),
  ],
);

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('S-06 · a message, a tool, a message: drawn in the order they happened', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            StreamMessage(messageId: 'm1', blocks: <String>['let me look']),
            ToolExecution(toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
            StreamMessage(messageId: 'm2', blocks: <String>['found it']),
          ],
        ),
      ),
    );

    final double first = tester.getTopLeft(find.text('let me look')).dy;
    final double tool = tester.getTopLeft(find.byType(ToolCard)).dy;
    final double second = tester.getTopLeft(find.text('found it')).dy;

    expect(first, lessThan(tool));
    expect(tool, lessThan(second));
  });

  testWidgets('a message from the person sits on the other side of the screen', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            StreamMessage(messageId: 'm1', blocks: <String>['mine'], isFromUser: true),
          ],
        ),
      ),
    );

    final Align align = tester.widget<Align>(
      find.ancestor(of: find.text('mine'), matching: find.byType(Align)).first,
    );

    expect(align.alignment, AlignmentDirectional.centerEnd);
  });

  testWidgets('the end of a turn and a compaction are lines in their place', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            TurnSummary(turnId: 'turn-1', costUsd: '0.2740', durationMs: 4200),
            CompactionLine(seq: 2, trigger: 'manual'),
            CompactionLine(seq: 3, trigger: 'auto', preTokens: 120000),
            CompactionLine(seq: 4, trigger: 'manual', preTokens: 9000),
            CompactionLine(seq: 5, trigger: 'auto'),
          ],
        ),
      ),
    );

    // Somebody's own money, spent by a process they started from a phone.
    expect(find.text(l10n.sessionTurnLine('0.2740', '4.2')), findsOneWidget);
    expect(find.text(l10n.sessionCompactedManual), findsOneWidget);
    expect(find.text(l10n.sessionCompactedAutoTokens('120,000')), findsOneWidget);
    expect(find.text(l10n.sessionCompactedManualTokens('9,000')), findsOneWidget);
    expect(find.text(l10n.sessionCompactedAuto), findsOneWidget);
  });

  testWidgets('a header scrolls with the conversation, above its first entry', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        header: Text('partial'),
        conversation: Conversation(
          entries: <ConversationEntry>[
            StreamMessage(messageId: 'm1', blocks: <String>['first']),
          ],
        ),
      ),
    );

    expect(
      tester.getTopLeft(find.text('partial')).dy,
      lessThan(tester.getTopLeft(find.text('first')).dy),
    );
  });

  group('the one scroll', () {
    testWidgets('opens at the end of a long conversation', (WidgetTester tester) async {
      await tester.pumpApp(ConversationView(conversation: longConversation(300, last: 'newest')));
      await tester.pumpAndSettle();

      expect(find.text('newest'), findsOneWidget);
      expect(find.text('answer number 0'), findsNothing);
    });

    testWidgets('S-12 · at the end, the end is followed as the conversation grows', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(ConversationView(conversation: longConversation(60)));
      await tester.pumpAndSettle();

      await tester.pumpApp(ConversationView(conversation: longConversation(61, last: 'arrived')));
      await tester.pumpAndSettle();

      expect(find.text('arrived'), findsOneWidget);
    });

    testWidgets('S-12 · scrolled up, what arrives at the tail does not move what is read', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(ConversationView(conversation: longConversation(60)));
      await tester.pumpAndSettle();

      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();
      final String text = tester
          .widget<Text>(find.textContaining('answer number').hitTestable().first)
          .data!;
      final double before = tester.getTopLeft(find.text(text)).dy;

      // The last answer grows, and another one arrives.
      final Conversation grown = Conversation(
        entries: <ConversationEntry>[
          ...longConversation(60).entries.take(59),
          const StreamMessage(messageId: 'm59', blocks: <String>['a much longer answer\n\n\n\n']),
          const StreamMessage(messageId: 'm60', blocks: <String>['arrived']),
        ],
      );
      await tester.pumpApp(ConversationView(conversation: grown));
      await tester.pumpAndSettle();

      expect(tester.getTopLeft(find.text(text)).dy, before);
      expect(find.text('arrived').hitTestable(), findsNothing);
    });
  });

  testWidgets('every kind of entry is drawn as what it is', (WidgetTester tester) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            ThinkingEntry(messageId: 'm1', index: 0, text: 'hm'),
            ToolExecution(toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
            ToolExecution(toolUseId: 't2', toolName: 'Read', input: <String, Object?>{}),
          ],
        ),
      ),
    );

    expect(find.byType(ToolCard), findsNWidgets(2));
    expect(find.text(l10n.thinkingLive), findsOneWidget);
  });
}
