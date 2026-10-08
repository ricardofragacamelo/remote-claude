/// One tool, running on somebody's own machine — a card that starts folded, says what the call is
/// for, and shows IN and OUT with the whole output asked for once (plan 22, B-32).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_output_view.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_transcript_content_repository.dart';
import '../../../support/pump_app.dart';

ToolExecution tool({
  ToolStatus status = ToolStatus.running,
  String output = '',
  String? summary,
  String toolName = 'Bash',
  Map<String, Object?> input = const <String, Object?>{'command': 'rm -rf /tmp/scratch'},
  String? title,
  bool isSubagent = false,
}) => ToolExecution(
  toolUseId: 't1',
  toolName: toolName,
  input: input,
  status: status,
  output: output,
  summary: summary,
  title: title,
  isSubagent: isSubagent,
);

void main() {
  late AppLocalizations l10n;
  late FakeTranscriptContentRepository content;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => content = FakeTranscriptContentRepository());

  Future<void> pump(WidgetTester tester, ToolExecution shown, {String? conversationId = 'c-1'}) =>
      tester.pumpApp(
        ToolCard(tool: shown, conversationId: conversationId),
        overrides: <Override>[transcriptContentRepositoryProvider.overrideWithValue(content)],
      );

  /// Opens or folds the card by its line.
  Future<void> toggle(WidgetTester tester) async {
    await tester.tap(
      find.byIcon(Icons.expand_more).hitTestable().evaluate().isEmpty
          ? find.byIcon(Icons.expand_less)
          : find.byIcon(Icons.expand_more),
    );
    await tester.pumpAndSettle();
  }

  group('S-117 · folded until asked', () {
    testWidgets('starts folded, with what it is and how it is going', (WidgetTester tester) async {
      await pump(tester, tool());

      expect(find.text('Bash'), findsOneWidget);
      expect(find.text(l10n.sessionToolStatusRunning), findsOneWidget);
      expect(find.textContaining('rm -rf /tmp/scratch'), findsNothing);
    });

    testWidgets('opens by a tap, and folds again', (WidgetTester tester) async {
      await pump(tester, tool());

      await toggle(tester);
      expect(find.text('rm -rf /tmp/scratch'), findsOneWidget);

      await toggle(tester);
      expect(find.text('rm -rf /tmp/scratch'), findsNothing);
    });

    testWidgets('opens by accessibility: a button that says it is folded, and whose tap opens it', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await pump(tester, tool(status: ToolStatus.succeeded));

      final String name = l10n.sessionToolRowLabel('Bash', l10n.sessionToolStatusSucceeded);
      final Finder line = find.bySemanticsLabel(name);
      expect(
        tester.getSemantics(line),
        isSemantics(isButton: true, hasExpandedState: true, isExpanded: false, hasTapAction: true),
      );

      tester.semantics.tap(find.semantics.byLabel(name));
      await tester.pumpAndSettle();

      expect(tester.getSemantics(line), isSemantics(isExpanded: true));
      expect(find.text('rm -rf /tmp/scratch'), findsOneWidget);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      semantics.dispose();
    });

    testWidgets('names each outcome the contract carries', (WidgetTester tester) async {
      final Map<ToolStatus, String> expected = <ToolStatus, String>{
        ToolStatus.running: l10n.sessionToolStatusRunning,
        ToolStatus.succeeded: l10n.sessionToolStatusSucceeded,
        ToolStatus.failed: l10n.sessionToolStatusFailed,
        ToolStatus.denied: l10n.sessionToolStatusDenied,
      };

      for (final MapEntry<ToolStatus, String> entry in expected.entries) {
        await pump(tester, tool(status: entry.key));

        expect(find.text(entry.value), findsOneWidget, reason: entry.key.name);
      }
    });

    testWidgets('the decision about it is on the card, folded too', (WidgetTester tester) async {
      await tester.pumpApp(
        ToolCard(
          tool: tool(status: ToolStatus.denied),
          decision: const PermissionOutcome.expired('r1', toolUseId: 't1'),
        ),
      );

      expect(find.byType(PermissionOutcomeLine), findsOneWidget);
    });
  });

  group('S-111 · the label says what the call is for', () {
    testWidgets('with a title: the tool and the description the model gave', (
      WidgetTester tester,
    ) async {
      await pump(tester, tool(title: 'Remove the scratch folder'));

      expect(find.text('Bash · Remove the scratch folder'), findsOneWidget);
    });

    test(
      'without one, its name, as before; a subagent keeps its name; MCP says server and tool',
      () {
        expect(toolLabel(l10n, tool()), 'Bash');
        expect(toolLabel(l10n, tool(toolName: 'Agent', title: 'Explore')), 'Agent');
        expect(toolLabel(l10n, tool(toolName: 'Task', title: 'Explore')), 'Task');
        expect(
          toolLabel(l10n, tool(toolName: 'mcp__github__create_issue', title: 'Open the bug')),
          'github · create_issue · Open the bug',
        );
        expect(
          toolLabel(l10n, tool(toolName: 'mcp__github__create_issue')),
          'mcp__github__create_issue',
        );
      },
    );
  });

  group('S-112 · IN and OUT of a shell command', () {
    testWidgets('IN is the command, whole and in mono; OUT is the end the timeline keeps', (
      WidgetTester tester,
    ) async {
      content.gate = Completer<void>();
      await pump(tester, tool(status: ToolStatus.succeeded, summary: '…\nremoved 2 files'));
      await toggle(tester);

      expect(find.text(l10n.sessionToolRowIn), findsOneWidget);
      expect(find.text(l10n.sessionToolRowOut), findsOneWidget);
      expect(tester.widget<Text>(find.text('rm -rf /tmp/scratch')).style?.fontFamily, 'monospace');
      expect(find.text('…\nremoved 2 files'), findsOneWidget);
      expect(find.text(l10n.sessionToolRowOutputLoading), findsOneWidget);
      content.gate!.complete();
    });

    testWidgets('the colours of a terminal are dropped, the text kept', (
      WidgetTester tester,
    ) async {
      content.failure = const NetworkFailure(traceId: 't');
      await pump(
        tester,
        tool(status: ToolStatus.succeeded, summary: '\x1B[32m✓ 12 passed\x1B[0m\x1B]0;title\x07'),
      );
      await toggle(tester);

      expect(find.text('✓ 12 passed'), findsOneWidget);
    });

    testWidgets('a command still running shows only IN — and OUT as soon as it prints', (
      WidgetTester tester,
    ) async {
      await pump(tester, tool());
      await toggle(tester);
      expect(find.text(l10n.sessionToolRowOut), findsNothing);

      await pump(tester, tool(output: 'removing…'));
      expect(find.text(l10n.sessionToolRowOut), findsOneWidget);
      expect(find.text('removing…'), findsOneWidget);
    });

    testWidgets('another tool keeps its input as it came, laid out — never Map.toString()', (
      WidgetTester tester,
    ) async {
      content.outputs['t1'] = const ToolOutput(text: '1: hello');
      await pump(
        tester,
        tool(
          toolName: 'Read',
          status: ToolStatus.succeeded,
          input: const <String, Object?>{'file_path': '/w/a.txt', 'limit': 3},
        ),
      );
      await toggle(tester);

      expect(find.text('{\n  "file_path": "/w/a.txt",\n  "limit": 3\n}'), findsOneWidget);
      expect(find.text(l10n.sessionToolRowIn), findsNothing);
      expect(find.text('1: hello'), findsOneWidget);
    });

    testWidgets('a value JSON does not know is written as text, not dropped', (
      WidgetTester tester,
    ) async {
      await pump(
        tester,
        tool(toolName: 'Custom', input: <String, Object?>{'at': DateTime.utc(2026, 10, 7)}),
      );
      await toggle(tester);

      expect(find.text('{\n  "at": "2026-10-07 00:00:00.000Z"\n}'), findsOneWidget);
    });

    testWidgets('a Bash call without a command string is shown as its input', (
      WidgetTester tester,
    ) async {
      await pump(tester, tool(input: const <String, Object?>{'command': 3}));
      await toggle(tester);

      expect(find.text('{\n  "command": 3\n}'), findsOneWidget);
    });
  });

  group('S-113 · the whole output, asked for once', () {
    testWidgets('opening asks for it; folding and opening again asks nothing', (
      WidgetTester tester,
    ) async {
      content.outputs['t1'] = const ToolOutput(text: 'every line\nof it');
      await pump(tester, tool(status: ToolStatus.succeeded, summary: 'of it'));

      expect(content.toolReads, isEmpty);

      await toggle(tester);
      expect(find.text('every line\nof it'), findsOneWidget);
      expect(find.text('of it'), findsNothing);

      await toggle(tester);
      await toggle(tester);

      expect(content.toolReads, <(String, String)>[('c-1', 't1')]);
      expect(find.text('every line\nof it'), findsOneWidget);
    });
  });

  group('S-114 · an output cut by the server', () {
    testWidgets('says how large it was, and marks where it was cut', (WidgetTester tester) async {
      content.outputs['t1'] = const ToolOutput(
        text: 'startend',
        truncated: true,
        bytes: 400000,
        cutAt: 5,
      );
      await pump(tester, tool(status: ToolStatus.succeeded));
      await toggle(tester);

      expect(find.text('start\n${l10n.sessionToolRowOutputCut}\nend'), findsOneWidget);
      expect(find.text(l10n.sessionToolRowOutputTruncated('400 kB')), findsOneWidget);
    });

    test('nothing is marked when nothing was cut', () {
      expect(withCut(const ToolOutput(text: 'all'), 'cut'), 'all');
    });
  });

  group('S-115 · the route fails', () {
    testWidgets('the end stays, says the whole did not load, and "try again" asks once more', (
      WidgetTester tester,
    ) async {
      content.failure = const ServerFailure(
        code: 'NOT_FOUND',
        messageKey: 'transcript.error.notFound',
        traceId: 't',
      );
      await pump(tester, tool(status: ToolStatus.failed, summary: 'exit 1'));
      await toggle(tester);

      expect(find.text('exit 1'), findsOneWidget);
      expect(find.text(l10n.sessionToolRowOutputFailed), findsOneWidget);

      content
        ..failure = null
        ..outputs['t1'] = const ToolOutput(text: 'the whole of it\nexit 1');
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(content.toolReads, hasLength(2));
      expect(find.text(l10n.sessionToolRowOutputFailed), findsNothing);
      expect(find.text('the whole of it\nexit 1'), findsOneWidget);
    });
  });

  group('S-116 · nothing to ask for', () {
    final Map<String, ToolExecution> cases = <String, ToolExecution>{
      'still running': tool(),
      'refused': tool(status: ToolStatus.denied, summary: 'not now'),
      "a subagent's": tool(status: ToolStatus.succeeded, isSubagent: true),
    };

    for (final MapEntry<String, ToolExecution> each in cases.entries) {
      testWidgets('${each.key}: opening asks the route nothing', (WidgetTester tester) async {
        await pump(tester, each.value);
        await toggle(tester);

        expect(content.toolReads, isEmpty);
      });
    }

    testWidgets('no conversation known yet: the end the timeline keeps, and no request', (
      WidgetTester tester,
    ) async {
      await pump(tester, tool(status: ToolStatus.succeeded, summary: 'done'), conversationId: null);
      await toggle(tester);

      expect(find.text('done'), findsOneWidget);
      expect(content.toolReads, isEmpty);
    });

    testWidgets('a tool that ends while open asks then', (WidgetTester tester) async {
      content.outputs['t1'] = const ToolOutput(text: 'finished');
      await pump(tester, tool());
      await toggle(tester);
      expect(content.toolReads, isEmpty);

      await pump(tester, tool(status: ToolStatus.succeeded));
      await tester.pumpAndSettle();

      expect(content.toolReads, <(String, String)>[('c-1', 't1')]);
      expect(find.text('finished'), findsOneWidget);
    });
  });
}
