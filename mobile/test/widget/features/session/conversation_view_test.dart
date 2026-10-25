/// What a session shows, in the order it happened — and the one scroll of the screen, which follows
/// the end only for somebody already at the end (plan 10, B-05, B-06).
library;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart' hide ToolOutput;
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/image_marker.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_subagent_repository.dart';
import '../../../support/fakes/fake_transcript_content_repository.dart';
import '../../../support/pump_app.dart';
import '../../../support/builders/tools.dart';

/// A conversation of [count] answers, one after the other.
Conversation longConversation(int count, {String last = 'answer'}) => Conversation(
  entries: <ConversationEntry>[
    for (int index = 0; index < count; index += 1)
      StreamMessage(
        messageId: 'm$index',
        blocks: <MessageBlock>[TextBlock(index == count - 1 ? last : 'answer number $index')],
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
            StreamMessage(messageId: 'm1', blocks: <MessageBlock>[TextBlock('let me look')]),
            ToolExecution(toolUseId: 't1', call: shellLs),
            StreamMessage(messageId: 'm2', blocks: <MessageBlock>[TextBlock('found it')]),
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
            StreamMessage(
              messageId: 'm1',
              blocks: <MessageBlock>[TextBlock('mine')],
              isFromUser: true,
            ),
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
    expect(
      find.text('${l10n.sessionTurnLine('0.2740', '4.2')} · ${l10n.sessionTurnNoTokens}'),
      findsOneWidget,
    );
    expect(find.text(l10n.sessionCompactedManual), findsOneWidget);
    expect(find.text(l10n.sessionCompactedAutoTokens('120,000')), findsOneWidget);
    expect(find.text(l10n.sessionCompactedManualTokens('9,000')), findsOneWidget);
    expect(find.text(l10n.sessionCompactedAuto), findsOneWidget);
  });

  testWidgets(
    'plan 28 · S-86, S-87 · a turn with no cost says none; one that cost zero says zero',
    (WidgetTester tester) async {
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              TurnSummary(turnId: 'turn-1', durationMs: 4200),
              TurnSummary(turnId: 'turn-2', costUsd: '0.000000', durationMs: 1000),
            ],
          ),
        ),
      );

      expect(
        find.text('${l10n.sessionTurnLineNoCost('4.2')} · ${l10n.sessionTurnNoTokens}'),
        findsOneWidget,
      );
      expect(
        find.text('${l10n.sessionTurnLine('0.000000', '1.0')} · ${l10n.sessionTurnNoTokens}'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'S-163, plan 27 B-10 · a turn that did not complete says so, never its cost or tokens',
    (WidgetTester tester) async {
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              TurnSummary(
                turnId: 'turn-1',
                durationMs: 0,
                costUsd: '10.080000',
                outcome: TurnOutcome.failed,
              ),
              TurnSummary(
                turnId: 'turn-2',
                durationMs: 500,
                outcome: TurnOutcome.limitReached,
              ),
            ],
          ),
        ),
      );

      expect(find.text(l10n.sessionTurnOutcomeFailed), findsOneWidget);
      expect(find.text(l10n.sessionTurnOutcomeLimitReached), findsOneWidget);
      expect(find.textContaining('10,08'), findsNothing);
      expect(find.textContaining('10.08'), findsNothing);
    },
  );

  testWidgets('a header scrolls with the conversation, above its first entry', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        header: Text('partial'),
        conversation: Conversation(
          entries: <ConversationEntry>[
            StreamMessage(messageId: 'm1', blocks: <MessageBlock>[TextBlock('first')]),
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
      final Finder found = find
          .textContaining('answer number', findRichText: true)
          .hitTestable()
          .first;
      final String text = tester.renderObject<RenderParagraph>(found).text.toPlainText();
      final double before = tester.getTopLeft(found).dy;

      // The last answer grows, and another one arrives.
      final Conversation grown = Conversation(
        entries: <ConversationEntry>[
          ...longConversation(60).entries.take(59),
          const StreamMessage(
            messageId: 'm59',
            blocks: <MessageBlock>[TextBlock('a much longer answer\n\n\n\n')],
          ),
          const StreamMessage(messageId: 'm60', blocks: <MessageBlock>[TextBlock('arrived')]),
        ],
      );
      await tester.pumpApp(ConversationView(conversation: grown));
      await tester.pumpAndSettle();

      expect(
        tester.getTopLeft(find.textContaining(text, findRichText: true).hitTestable().first).dy,
        before,
      );
      expect(find.textContaining('arrived', findRichText: true).hitTestable(), findsNothing);
    });
  });

  group('what arrives below a reader — plan 22, S-99', () {
    testWidgets('at the end, it is followed and nothing is counted', (WidgetTester tester) async {
      await tester.pumpApp(
        ConversationView(conversation: longConversation(60), countsUnseen: true),
      );
      await tester.pumpAndSettle();

      await tester.pumpApp(
        ConversationView(conversation: longConversation(62, last: 'arrived'), countsUnseen: true),
      );
      await tester.pumpAndSettle();

      expect(find.text('arrived').hitTestable(), findsOneWidget);
      expect(find.byType(UnseenPill), findsNothing);
    });

    testWidgets('scrolled up, "N new" counts what arrived and takes the reader to it', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        ConversationView(conversation: longConversation(60), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();

      await tester.pumpApp(
        ConversationView(conversation: longConversation(61, last: 'one more'), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      expect(find.text(l10n.historyFollowNewerOne), findsOneWidget);

      await tester.pumpApp(
        ConversationView(conversation: longConversation(63, last: 'arrived'), countsUnseen: true),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.historyFollowNewer(3)), findsOneWidget);
      expect(find.text('arrived').hitTestable(), findsNothing);
      expect(tester.getSemantics(find.byType(UnseenPill)), matchesSemantics(isLiveRegion: true));

      await tester.tap(find.text(l10n.historyFollowNewer(3)));
      await tester.pumpAndSettle();

      expect(find.text('arrived').hitTestable(), findsOneWidget);
      expect(find.byType(UnseenPill), findsNothing);
    });

    testWidgets('going back to the end by hand sees what was new', (WidgetTester tester) async {
      await tester.pumpApp(
        ConversationView(conversation: longConversation(60), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();
      await tester.pumpApp(
        ConversationView(conversation: longConversation(62, last: 'arrived'), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      expect(find.byType(UnseenPill), findsOneWidget);

      await tester.fling(find.byType(ListView), const Offset(0, -20000), 5000);
      await tester.pumpAndSettle();

      expect(find.byType(UnseenPill), findsNothing);
    });

    testWidgets('S-84 · it counts messages, as the web does: a thinking and an answer of one reply '
        'are one, and a reply that only calls a tool is none', (WidgetTester tester) async {
      await tester.pumpApp(
        ConversationView(conversation: longConversation(60), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();

      await tester.pumpApp(
        ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              ...longConversation(60).entries,
              const ThinkingEntry(messageId: 'r1', index: 0, isComplete: true),
              const StreamMessage(messageId: 'r1', blocks: <MessageBlock>[TextBlock('one reply')]),
              const ToolExecution(toolUseId: 't1', call: shellLs),
              const ToolExecution(toolUseId: 't2', call: readA),
            ],
          ),
          countsUnseen: true,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.historyFollowNewerOne), findsOneWidget);
    });

    testWidgets('S-84 · an earlier page read meanwhile goes before, and is never new', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        ConversationView(conversation: longConversation(60), countsUnseen: true),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();

      await tester.pumpApp(
        ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              for (int index = 0; index < 25; index += 1)
                StreamMessage(
                  messageId: 'earlier$index',
                  blocks: <MessageBlock>[TextBlock('earlier $index')],
                ),
              ...longConversation(60).entries,
            ],
          ),
          countsUnseen: true,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(UnseenPill), findsNothing);
    });

    test('S-84 · what is counted, and from where', () {
      const List<ConversationEntry> entries = <ConversationEntry>[
        StreamMessage(messageId: 'u1', isFromUser: true, blocks: <MessageBlock>[TextBlock('go')]),
        ThinkingEntry(messageId: 'a1', index: 0),
        StreamMessage(messageId: 'a1', streaming: 'look'),
        StreamMessage(messageId: 'a2'),
        ToolExecution(toolUseId: 't1', call: shellLs),
        StreamMessage(
          messageId: 'u2',
          isFromUser: true,
          blocks: <MessageBlock>[ImageBlock(PromptImage(blockId: 'u2:0'))],
        ),
      ];

      expect(lastShown(entries), 'u2');
      expect(lastShown(const <ConversationEntry>[]), isNull);
      expect(countAfter(entries, 'u1'), 2);
      expect(countAfter(entries, 'u2'), 0);
      expect(countAfter(entries, null), 0);
      // A mark the conversation no longer has — it was read again — counts nothing.
      expect(countAfter(entries, 'gone'), 0);
      expect(countAfter(entries, 'a2'), 0);
    });

    testWidgets('the live session counts nothing: it was not asked to', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(ConversationView(conversation: longConversation(60)));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1500));
      await tester.pumpAndSettle();

      await tester.pumpApp(ConversationView(conversation: longConversation(62)));
      await tester.pumpAndSettle();

      expect(find.byType(UnseenPill), findsNothing);
    });
  });

  testWidgets('every kind of entry is drawn as what it is', (WidgetTester tester) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            ThinkingEntry(messageId: 'm1', index: 0, text: 'hm'),
            ToolExecution(toolUseId: 't1', call: shellLs),
            ToolExecution(toolUseId: 't2', call: readA),
          ],
        ),
      ),
    );

    expect(find.byType(ToolCard), findsNWidgets(2));
    expect(find.text(l10n.thinkingLive), findsOneWidget);
  });

  group('the author of a message — plan 22 · D-16, plan 26 · B-11', () {
    testWidgets('shows at the start of a run of the same author, not again inside it', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(
                messageId: 'u1',
                isFromUser: true,
                blocks: <MessageBlock>[TextBlock('hi')],
              ),
              StreamMessage(messageId: 'a1', blocks: <MessageBlock>[TextBlock('one')]),
              StreamMessage(messageId: 'a2', blocks: <MessageBlock>[TextBlock('two')]),
            ],
          ),
        ),
      );

      expect(find.text(l10n.sessionMessageAuthorYou), findsOneWidget);
      expect(find.text(l10n.sessionMessageAuthorAgent(l10n.engineNameFallback)), findsOneWidget);
    });

    testWidgets('a turn ending re-announces the next answer', (WidgetTester tester) async {
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(messageId: 'a1', blocks: <MessageBlock>[TextBlock('one')]),
              TurnSummary(turnId: 't1', durationMs: 1),
              StreamMessage(messageId: 'a2', blocks: <MessageBlock>[TextBlock('two')]),
            ],
          ),
        ),
      );

      expect(find.text(l10n.sessionMessageAuthorAgent(l10n.engineNameFallback)), findsNWidgets(2));
    });
  });

  group('copying a message — plan 26 · B-11', () {
    List<String> clipboard(WidgetTester tester) {
      final List<String> copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
        MethodCall call,
      ) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map<Object?, Object?>)['text']! as String);
        }
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      return copied;
    }

    testWidgets('the button on the model\'s bubble copies its markdown', (
      WidgetTester tester,
    ) async {
      final List<String> copied = clipboard(tester);
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(messageId: 'a1', blocks: <MessageBlock>[TextBlock('the answer')]),
            ],
          ),
        ),
      );

      await tester.tap(find.byTooltip(l10n.sessionMessageCopy));
      await tester.pump();

      expect(copied, <String>['the answer']);
      expect(find.text(l10n.sessionMessageCopied), findsOneWidget);
    });

    testWidgets('a long press on the model\'s bubble copies it too', (WidgetTester tester) async {
      final List<String> copied = clipboard(tester);
      await tester.pumpApp(
        const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(messageId: 'a1', blocks: <MessageBlock>[TextBlock('the answer')]),
            ],
          ),
        ),
      );

      await tester.longPress(find.text('the answer'));
      await tester.pump();

      expect(copied, <String>['the answer']);
    });
  });

  testWidgets('S-28 · an image between two blocks of text stays between them', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ConversationView(
        conversation: Conversation(
          entries: <ConversationEntry>[
            StreamMessage(
              messageId: 'u1',
              isFromUser: true,
              blocks: <MessageBlock>[
                TextBlock('before'),
                ImageBlock(PromptImage(blockId: 'u1:1')),
                TextBlock('after'),
              ],
            ),
          ],
        ),
      ),
    );

    final double before = tester.getTopLeft(find.text('before')).dy;
    final double image = tester.getTopLeft(find.byType(ImageMarker)).dy;
    final double after = tester.getTopLeft(find.text('after')).dy;

    expect(before, lessThan(image));
    expect(image, lessThan(after));
  });

  testWidgets('S-37 · a file-path-like mention of a message opens the viewer at that line (B-10)', (
    WidgetTester tester,
  ) async {
    String? opened;
    await tester.pumpRouted(<RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext _, GoRouterState _) => const ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(
                messageId: 'a1',
                blocks: <MessageBlock>[TextBlock('see src/x.ts:42 for it')],
              ),
            ],
            facts: SessionFacts(workspacePath: '/home/dev/project'),
          ),
        ),
      ),
      GoRoute(
        path: fileViewerRoute,
        builder: (BuildContext _, GoRouterState state) {
          opened = state.uri.toString();
          return const Text('viewer');
        },
      ),
    ]);

    await tester.tap(find.textContaining('src/x.ts:42', findRichText: true));
    await tester.pumpAndSettle();

    expect(opened, isNotNull);
    expect(Uri.parse(opened!).queryParameters[viewerPathParameter], 'src/x.ts');
    expect(Uri.parse(opened!).queryParameters[viewerLineParameter], '42');
  });

  group('the block still arriving — plan 26, D-02, D-14', () {
    Conversation streaming(String text) => Conversation(
      entries: <ConversationEntry>[StreamMessage(messageId: 'a1', streaming: text)],
    );

    testWidgets('S-34 · shows the first text at once', (WidgetTester tester) async {
      await tester.pumpApp(ConversationView(conversation: streaming('Hel')), pumpOnce: false);
      await tester.pump();

      expect(find.textContaining('Hel', findRichText: true), findsOneWidget);
    });

    testWidgets('S-34 · a burst of deltas settles on the latest text, not every step', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(ConversationView(conversation: streaming('H')), pumpOnce: false);
      await tester.pump();

      // Every delta rebuilds the tree, as the socket delivers it — faster than the throttle.
      for (final String text in <String>['He', 'Hel', 'Hell', 'Hello']) {
        await tester.pumpApp(ConversationView(conversation: streaming(text)), pumpOnce: false);
        await tester.pump(const Duration(milliseconds: 10));
      }

      // Still the text from before the burst: nothing has reparsed yet.
      expect(find.textContaining('H', findRichText: true), findsOneWidget);
      expect(find.textContaining('Hello', findRichText: true), findsNothing);

      await tester.pump(const Duration(milliseconds: 150));

      // The one reparse shows the latest text, complete — none of the steps in between.
      expect(find.textContaining('Hello', findRichText: true), findsOneWidget);
    });
  });

  group('plan 26, B-19 · a subagent nested under its card', () {
    Future<void> openCard(WidgetTester tester, Finder within) async {
      await tester.tap(find.descendant(of: within, matching: find.byIcon(Icons.expand_more)));
      await tester.pumpAndSettle();
    }

    testWidgets(
      'S-66 · text, thinking and a tool of the subagent sit under its card, folded until opened',
      (WidgetTester tester) async {
        await tester.pumpApp(
          ConversationView(
            conversation: Conversation(
              entries: <ConversationEntry>[
                ToolExecution(
                  toolUseId: 'agent-1',
                  call: agentCall(),
                  status: ToolStatus.succeeded,
                ),
                const StreamMessage(
                  messageId: 'm1',
                  blocks: <MessageBlock>[TextBlock('digging in the files')],
                  parentToolUseId: 'agent-1',
                ),
                const ThinkingEntry(
                  messageId: 'm1',
                  index: 0,
                  text: 'hm',
                  parentToolUseId: 'agent-1',
                ),
                const ToolExecution(
                  toolUseId: 'sub-tool',
                  call: shellLs,
                  status: ToolStatus.succeeded,
                  parentToolUseId: 'agent-1',
                ),
              ],
            ),
          ),
        );

        // Folded: the subagent's own content is not drawn until its card opens.
        expect(find.text('digging in the files'), findsNothing);

        await openCard(tester, find.byType(ConversationView));

        expect(find.text('digging in the files'), findsOneWidget);
        expect(find.text('hm'), findsOneWidget);
        expect(find.text(l10n.sessionToolShell('ls')), findsOneWidget);
      },
    );

    testWidgets('S-67 · a subagent of a subagent nests too, with no ceiling', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              ToolExecution(toolUseId: 'agent-1', call: agentCall(), status: ToolStatus.succeeded),
              ToolExecution(
                toolUseId: 'agent-2',
                call: agentCall(description: 'Explore further'),
                status: ToolStatus.succeeded,
                parentToolUseId: 'agent-1',
              ),
              const StreamMessage(
                messageId: 'deep',
                blocks: <MessageBlock>[TextBlock('deeply nested')],
                parentToolUseId: 'agent-2',
              ),
            ],
          ),
        ),
      );

      // One card at a time: opening agent-1 reveals agent-2's own (still folded) card.
      await openCard(tester, find.byType(ConversationView));
      expect(find.text('deeply nested'), findsNothing);
      expect(
        find.text(l10n.sessionToolAgent('general-purpose', 'Explore further')),
        findsOneWidget,
      );

      await openCard(tester, find.byType(ConversationView));
      expect(find.text('deeply nested'), findsOneWidget);
    });

    group('plan 26, B-20 · reopened from the history, with nothing live', () {
      const ConversationKey key = ConversationKey(engine: 'engine-a', id: 'c-1');
      late FakeSubagentRepository repo;
      late FakeTranscriptContentRepository content;

      setUp(() {
        repo = FakeSubagentRepository();
        // Irrelevant to these tests, but opening the agent's own card also asks for its whole
        // output (it is a finished tool of the main conversation, not a subagent itself) — answered
        // here so that unrelated failure never masks the one these tests are about.
        content = FakeTranscriptContentRepository()
          ..outputs['agent-1'] = const ToolOutput(text: 'done');
      });

      Future<void> pump(WidgetTester tester, {bool pumpOnce = true}) => tester.pumpApp(
        ConversationView(
          conversationKey: key,
          conversation: Conversation(
            entries: <ConversationEntry>[
              ToolExecution(toolUseId: 'agent-1', call: agentCall(), status: ToolStatus.succeeded),
            ],
          ),
        ),
        overrides: <Override>[
          subagentRepositoryProvider.overrideWithValue(repo),
          transcriptContentRepositoryProvider.overrideWithValue(content),
        ],
        pumpOnce: pumpOnce,
      );

      Future<void> openCard(WidgetTester tester) async {
        await tester.tap(find.byIcon(Icons.expand_more));
        await tester.pumpAndSettle();
      }

      testWidgets('S-69 · opening the card reads the route, by the conversation and the tool', (
        WidgetTester tester,
      ) async {
        repo.pages['agent-1'] = const SubagentPage(
          events: <SessionEvent>[
            MessageFinished(
              1,
              messageId: 'm1',
              blocks: <MessageBlock>[TextBlock('what the subagent found')],
              isFromUser: false,
              parentToolUseId: 'agent-1',
            ),
          ],
        );
        await pump(tester);

        await openCard(tester);

        expect(find.text('what the subagent found'), findsOneWidget);
        expect(repo.reads, <(ConversationKey, String)>[(key, 'agent-1')]);
      });

      testWidgets('loading says so, and an empty page says the history kept nothing', (
        WidgetTester tester,
      ) async {
        repo.pages['agent-1'] = const SubagentPage(events: <SessionEvent>[]);
        await pump(tester);

        await openCard(tester);

        expect(find.text(l10n.sessionSubagentNothing), findsOneWidget);
      });

      testWidgets('S-70 · the route failing says why, with "try again" — the rest stays', (
        WidgetTester tester,
      ) async {
        repo.failure = const NetworkFailure(traceId: 't');
        await pump(tester);

        await openCard(tester);

        expect(find.text(l10n.commonActionRetry), findsOneWidget);
        // The rest of the conversation — the card itself — is unaffected by the failure.
        expect(find.text(l10n.sessionToolAgent('general-purpose', 'Explore')), findsOneWidget);

        repo.failure = null;
        repo.pages['agent-1'] = const SubagentPage(
          events: <SessionEvent>[
            MessageFinished(
              1,
              messageId: 'm1',
              blocks: <MessageBlock>[TextBlock('after retrying')],
              isFromUser: false,
              parentToolUseId: 'agent-1',
            ),
          ],
        );
        await tester.tap(find.text(l10n.commonActionRetry));
        await tester.pumpAndSettle();

        expect(find.text('after retrying'), findsOneWidget);
      });
    });

    testWidgets('S-68 · a subagent\'s tool never shows up as a card of its own, at the top', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        ConversationView(
          conversation: Conversation(
            entries: <ConversationEntry>[
              ToolExecution(toolUseId: 'agent-1', call: agentCall(), status: ToolStatus.succeeded),
              ToolExecution(
                toolUseId: 'sub-tool',
                call: shellCall('whoami'),
                status: ToolStatus.succeeded,
                parentToolUseId: 'agent-1',
              ),
            ],
          ),
        ),
      );

      // Not visible before the subagent's own card opens.
      expect(find.text(l10n.sessionToolShell('whoami')), findsNothing);

      await openCard(tester, find.byType(ConversationView));

      // Visible exactly once it does — nested, never as a second top-level card.
      expect(find.text(l10n.sessionToolShell('whoami')), findsOneWidget);
    });
  });
}
