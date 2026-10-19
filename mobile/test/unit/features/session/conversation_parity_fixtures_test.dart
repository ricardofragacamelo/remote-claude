/// The recordings of plan 26 (B-02), read by the app's own mapper: the content it projects from the
/// same events the web is measured against, so a client that reads one into less — or more — than
/// the other fails here, before a screenshot or an e2e run notices (plan 26, F6, B-28).
///
/// Cenários S-82, S-83.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

const List<String> _fixtures = <String>[
  'markdown-rich-turn',
  'multi-text-block-turn',
  'explanatory-style-turn',
  'mcp-untitled-tool-turn',
  'subagent-permission-turn',
];

const String _root = '../packages/contracts/fixtures/conversation-parity';

/// The events of [file] of [fixture] — `[]` when that fixture recorded none (no subagent, say).
List<Object?> _eventsOf(String fixture, String file) {
  final File target = File('$_root/$fixture/$file');
  return target.existsSync()
      ? jsonDecode(target.readAsStringSync()) as List<Object?>
      : const <Object?>[];
}

List<Map<String, Object?>> _expectedOf(String fixture) {
  final Map<String, Object?> expected =
      jsonDecode(File('$_root/$fixture/expected.json').readAsStringSync()) as Map<String, Object?>;
  return (expected['entries']! as List<Object?>).cast<Map<String, Object?>>();
}

/// [events] — a wire frame's `{type, payload}`, with no envelope — folded the same way the app folds
/// a page of history: `withHistory`, the one folder a subagent's own history, the main transcript and
/// a reload already share (B-20). None of these fixtures carries a live `seq` — `historyEventFrom`
/// never reads one — so `apply`'s replay guard is not what either path is measured through here.
Conversation _conversationOf(List<Object?> events) => const Conversation().withHistory(
  <SessionEvent>[for (final Object? raw in events) ?historyEventFrom(raw)],
);

Map<String, Object?> _labelOf(ToolLabel label) => <String, Object?>{
  'messageKey': label.messageKey,
  'params': label.params,
};

/// The present counts of [turn] — never a zero or a `null` for one the engine did not report (plan
/// 26, B-17, S-62), the same rule the web's own `usageOf` follows.
Map<String, Object?> _usageOf(TurnSummary turn) {
  final Map<String, Object?> usage = <String, Object?>{};

  void put(String key, int? value) {
    if (value != null) {
      usage[key] = value;
    }
  }

  put('inputTokens', turn.inputTokens);
  put('outputTokens', turn.outputTokens);
  put('cacheReadTokens', turn.cacheReadTokens);
  put('cacheWriteTokens', turn.cacheWriteTokens);
  put('reasoningTokens', turn.reasoningTokens);
  put('webSearches', turn.webSearches);

  return usage;
}

Map<String, Object?>? _blockOf(MessageBlock block) => switch (block) {
  TextBlock(:final String text) => <String, Object?>{'kind': 'text', 'text': text},
  ImageBlock() => <String, Object?>{'kind': 'image'},
};

/// [conversation], as the neutral content both clients are measured against: the flat list of
/// entries, unpacked — `rawInput`, `subject`, `changes`, `title` and every timestamp stay out (never
/// part of what a client is allowed to disagree about, since nothing checks them here). A message
/// with no text or image block — only thinking, or only what opened a tool — names no entry, the
/// same "nothing to show" rule `_shownMessage` already draws by (S-84).
List<Map<String, Object?>> _neutralEntriesOf(Conversation conversation) {
  final List<Map<String, Object?>> entries = <Map<String, Object?>>[];

  for (final ConversationEntry entry in conversation.entries) {
    switch (entry) {
      case StreamMessage(:final List<MessageBlock> blocks) when blocks.isNotEmpty:
        entries.add(<String, Object?>{
          'kind': 'message',
          'owner': entry.parentToolUseId,
          'author': entry.isFromUser ? 'user' : 'assistant',
          'blocks': <Object?>[for (final MessageBlock block in blocks) _blockOf(block)],
        });
      case StreamMessage():
        break;
      case ThinkingEntry():
        entries.add(<String, Object?>{
          'kind': 'thinking',
          'owner': entry.parentToolUseId,
          'text': entry.text,
          'redacted': entry.isRedacted,
        });
      case ToolExecution():
        entries.add(<String, Object?>{
          'kind': 'tool',
          'owner': entry.parentToolUseId,
          'toolKind': entry.call.kind,
          'label': _labelOf(entry.call.label),
          'status': entry.status.name,
          'media': const <Object?>[],
        });
      case TurnSummary():
        entries.add(<String, Object?>{
          'kind': 'turn',
          'owner': null,
          'usage': _usageOf(entry),
          'costUsd': entry.costUsd,
        });
      case CompactionLine():
      case RewoundLine():
      case ReplayGapLine():
        break;
    }
  }

  return entries;
}

void main() {
  for (final String fixture in _fixtures) {
    group(fixture, () {
      late List<Map<String, Object?>> expected;

      setUpAll(() {
        expected = _expectedOf(fixture);
      });

      test('projects the live events into the same content — S-82', () {
        final Conversation conversation = _conversationOf(_eventsOf(fixture, 'live-events.json'));

        expect(_neutralEntriesOf(conversation), expected);
      });

      test(
        'projects the history into the same content, minus what history never carries — S-83',
        () {
          final Conversation conversation = _conversationOf(
            _eventsOf(fixture, 'history-events.json'),
          );
          final List<Map<String, Object?>> want = expected
              .where(
                (Map<String, Object?> entry) => entry['kind'] != 'turn' && entry['owner'] == null,
              )
              .toList();

          expect(_neutralEntriesOf(conversation), want);
        },
      );

      test('projects a subagent’s own history into its own slice of the same content — S-83', () {
        final Conversation conversation = _conversationOf(
          _eventsOf(fixture, 'subagent-history-events.json'),
        );
        final List<Map<String, Object?>> want = expected
            .where((Map<String, Object?> entry) => entry['owner'] != null)
            .toList();

        expect(_neutralEntriesOf(conversation), want);
      });
    });
  }
}
