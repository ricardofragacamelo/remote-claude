/// The conversation as the Claude Code shows it — plan 22, F6: how long a thinking of the history took
/// at most, the description of a tool call, and the image of a prompt.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// A thinking of the history, in a reply written at [writtenAt].
MessageFinished thought(String messageId, String writtenAt, {String text = ''}) => MessageFinished(
  0,
  messageId: messageId,
  text: '',
  isFromUser: false,
  thoughts: <Thought>[Thought(text, blockId: '$messageId:0')],
  writtenAt: writtenAt,
);

/// The thinkings of a conversation read from [history].
List<ThinkingEntry> thinkingOf(List<SessionEvent> history) =>
    const Conversation().withHistory(history).thinking;

void main() {
  group('how long a thinking of the history took, at most — S-104, S-106 (D-14)', () {
    test('S-104 · bounded by the entry before it: a tool that ended, and the reply after it', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        const ToolInvoked(
          0,
          toolUseId: 't1',
          toolName: 'Bash',
          input: <String, Object?>{},
          writtenAt: '2026-10-07T12:00:00.000Z',
        ),
        const ToolFinished(
          0,
          toolUseId: 't1',
          status: ToolStatus.succeeded,
          writtenAt: '2026-10-07T12:00:03.000Z',
        ),
        thought('m2', '2026-10-07T12:00:10.500Z'),
      ]);

      expect(thinking.single.atMost, const Duration(milliseconds: 7500));
    });

    test('each thinking is bounded by the entry just before it, whatever its kind', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        thought('m1', '2026-10-07T12:00:04.000Z'),
        thought('m2', '2026-10-07T12:01:10.000Z'),
      ]);

      expect(thinking.first.atMost, isNull);
      expect(thinking.last.atMost, const Duration(seconds: 66));
    });

    test('S-106 · the first entry of the history has nothing before it: no bound', () {
      expect(
        thinkingOf(<SessionEvent>[thought('m1', '2026-10-07T12:00:04.000Z')]).single.atMost,
        isNull,
      );
    });

    test('S-106 · a server older than the instants dates nothing: no bound', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        const ToolFinished(0, toolUseId: 't1', status: ToolStatus.succeeded),
        thought('m2', ''),
      ]);

      expect(thinking.single.atMost, isNull);
    });

    test('S-106 · an instant the history wrote earlier than the one before is no duration — not '
        '"0 s" (the queued prompt, S-21)', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        const ToolFinished(
          0,
          toolUseId: 't1',
          status: ToolStatus.succeeded,
          writtenAt: '2026-10-07T12:00:09.000Z',
        ),
        thought('m2', '2026-10-07T12:00:05.000Z'),
      ]);

      expect(thinking.single.atMost, isNull);
    });

    test('S-105 · the same instant twice is a bound of zero, which the line rounds', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        thought('m1', '2026-10-07T12:00:05.000Z'),
        thought('m2', '2026-10-07T12:00:05.000Z'),
      ]);

      expect(thinking.last.atMost, Duration.zero);
    });

    test('an entry with no instant does not move the bound: the next is measured from the last '
        'one dated', () {
      final List<ThinkingEntry> thinking = thinkingOf(<SessionEvent>[
        const ToolFinished(
          0,
          toolUseId: 't1',
          status: ToolStatus.succeeded,
          writtenAt: '2026-10-07T12:00:00.000Z',
        ),
        const ToolInvoked(0, toolUseId: 't2', toolName: 'Read', input: <String, Object?>{}),
        thought('m2', '2026-10-07T12:00:02.000Z'),
      ]);

      expect(thinking.single.atMost, const Duration(seconds: 2));
    });

    test('S-107 · live, the stream measures it, and nothing is bounded', () {
      final Conversation live = const Conversation()
          .apply(const ThinkingFragment(1, messageId: 'm', delta: 'hm', at: '2026-10-07T12:00:00Z'))
          .apply(
            const MessageFinished(
              2,
              messageId: 'm',
              text: '',
              isFromUser: false,
              thoughts: <Thought>[Thought('hm')],
              at: '2026-10-07T12:00:04Z',
            ),
          );

      expect(live.thinking.single.duration, const Duration(seconds: 4));
      expect(live.thinking.single.atMost, isNull);
    });

    test('reading the same history twice gives the same bounds (S-91)', () {
      final List<SessionEvent> history = <SessionEvent>[
        thought('m1', '2026-10-07T12:00:00.000Z'),
        thought('m2', '2026-10-07T12:00:09.000Z'),
      ];

      expect(
        const Conversation().withHistory(history),
        const Conversation().withHistory(history).withHistory(history),
      );
    });
  });

  group('the description the model gave a call — S-111', () {
    test('is kept on the tool, and a tool without one has none', () {
      final Conversation shown = const Conversation().withHistory(const <SessionEvent>[
        ToolInvoked(
          0,
          toolUseId: 't1',
          toolName: 'Bash',
          input: <String, Object?>{'command': 'pnpm test'},
          title: 'Run the tests',
        ),
        ToolInvoked(0, toolUseId: 't2', toolName: 'Read', input: <String, Object?>{}),
      ]);

      expect(shown.tools.first.title, 'Run the tests');
      expect(shown.tools.last.title, isNull);
    });

    test('survives the tool ending', () {
      final Conversation shown = const Conversation()
          .apply(
            const ToolInvoked(
              1,
              toolUseId: 't1',
              toolName: 'Bash',
              input: <String, Object?>{},
              title: 'List the files',
            ),
          )
          .apply(const ToolFinished(2, toolUseId: 't1', status: ToolStatus.succeeded));

      expect(shown.tools.single.title, 'List the files');
      expect(shown.tools.single.status, ToolStatus.succeeded);
    });
  });

  group('the image of a prompt — S-118, S-121', () {
    const PromptImage png = PromptImage(blockId: 'u1:1', mediaType: 'image/png', size: 48213);

    test('S-118 · a prompt with text and an image keeps both: the text, and the marker', () {
      final Conversation shown = const Conversation().withHistory(const <SessionEvent>[
        MessageFinished(
          0,
          messageId: 'u1',
          text: 'what is wrong here?',
          isFromUser: true,
          images: <PromptImage>[png],
        ),
      ]);

      expect(shown.messages.single.text, 'what is wrong here?');
      expect(shown.messages.single.images, <PromptImage>[png]);
    });

    test('S-121 · a prompt of only an image is a turn of the person with its marker, and no empty '
        'text', () {
      final Conversation shown = const Conversation().withHistory(const <SessionEvent>[
        MessageFinished(0, messageId: 'u1', text: '', isFromUser: true, images: <PromptImage>[png]),
      ]);

      final StreamMessage prompt = shown.messages.single;
      expect(prompt.isFromUser, isTrue);
      expect(prompt.blocks, isEmpty);
      expect(prompt.images, <PromptImage>[png]);
    });

    test('the same image arriving again is still one marker (S-36)', () {
      const MessageFinished prompt = MessageFinished(
        3,
        messageId: 'u1',
        text: 'look',
        isFromUser: true,
        images: <PromptImage>[png],
        textBlockIds: <String>['u1:0'],
      );
      final Conversation shown = const Conversation().apply(prompt).withHistory(
        const <SessionEvent>[prompt],
      );
      final Conversation twice = const Conversation()
          .apply(prompt)
          .apply(
            const MessageFinished(
              4,
              messageId: 'u1',
              text: 'look',
              isFromUser: true,
              images: <PromptImage>[png],
              textBlockIds: <String>['u1:0'],
            ),
          );

      expect(shown.messages.single.images, <PromptImage>[png]);
      expect(twice.messages.single.images, <PromptImage>[png]);
      expect(twice.messages.single.blocks, <String>['look']);
    });

    test('two images of one prompt are two markers, in their order', () {
      const PromptImage jpeg = PromptImage(blockId: 'u1:2', mediaType: 'image/jpeg');
      final Conversation shown = const Conversation().withHistory(const <SessionEvent>[
        MessageFinished(
          0,
          messageId: 'u1',
          text: '',
          isFromUser: true,
          images: <PromptImage>[png, jpeg],
        ),
      ]);

      expect(shown.messages.single.images, <PromptImage>[png, jpeg]);
    });

    test('an answer of the model that is only an image block adds a message with it', () {
      final Conversation shown = const Conversation().apply(
        const MessageFinished(
          1,
          messageId: 'a1',
          text: '',
          isFromUser: false,
          images: <PromptImage>[png],
        ),
      );

      expect(shown.messages.single.images, <PromptImage>[png]);
    });

    test('a message copied keeps its images', () {
      const StreamMessage message = StreamMessage(
        messageId: 'u1',
        images: <PromptImage>[png],
        streaming: 'x',
      );

      expect(message.copyWith(streaming: () => null).images, <PromptImage>[png]);
    });
  });
}
