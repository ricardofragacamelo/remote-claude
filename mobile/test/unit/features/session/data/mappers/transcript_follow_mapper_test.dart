/// Reading the frames of a followed conversation (plan 22, B-24, S-90).
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/features/session/data/mappers/transcript_follow_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

import '../../../../../support/builders/frames.dart';

FollowUpdate? read(String raw) => followUpdateFrom(decodeEnvelope(raw)!);

/// [raw] with its payload changed by [change].
String withPayload(String raw, void Function(Map<String, Object?> payload) change) {
  final Map<String, Object?> envelope = jsonDecode(raw)! as Map<String, Object?>;
  change(envelope['payload']! as Map<String, Object?>);
  return jsonEncode(envelope);
}

void main() {
  test('the ack names the subscription, the command it answers and the activity', () {
    expect(
      read(transcriptFollowing(correlationId: 'cmd-1')),
      const FollowStarted(
        commandId: 'cmd-1',
        followId: 't-1',
        conversationId: 'conv-1',
        activity: ConversationActivity.activeElsewhere,
      ),
    );
  });

  test('an activity this build does not know is said as nothing', () {
    final FollowStarted started =
        read(transcriptFollowing(correlationId: 'cmd-1', activity: 'somewhereNew'))!
            as FollowStarted;

    expect(started.activity, isNull);
  });

  test('S-90 · what was appended carries the entries, read as a page reads them', () {
    final FollowAppended appended =
        read(
              transcriptAppended(
                seq: 2,
                raws: <String>[
                  messageCompleted(messageId: 'm5', text: 'done', seq: 1),
                  toolStarted(toolUseId: 'tool-1', seq: 2),
                ],
                lastMessageId: 'u-44',
                working: true,
              ),
            )!
            as FollowAppended;

    expect(appended.followId, 't-1');
    expect(appended.conversationId, 'conv-1');
    expect(appended.seq, 2);
    expect(appended.events.map((SessionEvent event) => event.runtimeType), <Type>[
      MessageFinished,
      ToolInvoked,
    ]);
    // History has no place in any session's numbering.
    expect(appended.events.every((SessionEvent event) => event.seq == 0), isTrue);
    expect(appended.lastMessageId, 'u-44');
    expect(appended.activity, ConversationActivity.activeElsewhere);
    expect(appended.working, isTrue);
  });

  test('a frame with no entries and no last entry says only what the conversation is doing', () {
    final FollowAppended appended =
        read(transcriptAppended(seq: 1, activity: 'idle'))! as FollowAppended;

    expect(appended.events, isEmpty);
    expect(appended.lastMessageId, isNull);
    expect(appended.activity, ConversationActivity.idle);
    expect(appended.working, isFalse);
  });

  test('one entry this build cannot read costs that entry, not the frame', () {
    final String raw = withPayload(
      transcriptAppended(
        seq: 1,
        raws: <String>[messageCompleted(messageId: 'm5', text: 'done', seq: 1)],
      ),
      (Map<String, Object?> payload) => (payload['events']! as List<Object?>).insert(
        0,
        <String, Object?>{'type': 'something.new', 'payload': <String, Object?>{}},
      ),
    );

    expect((read(raw)! as FollowAppended).events, hasLength(1));
  });

  test(
    'a reset says why: a rewritten chain, a conversation gone — and an unknown reason ends it too',
    () {
      expect(
        read(transcriptReset(seq: 3)),
        const FollowReset(
          followId: 't-1',
          conversationId: 'conv-1',
          seq: 3,
          reason: FollowResetReason.rewritten,
        ),
      );
      expect(
        (read(transcriptReset(seq: 3, reason: 'gone'))! as FollowReset).reason,
        FollowResetReason.gone,
      );
      expect(
        (read(transcriptReset(seq: 3, reason: 'other'))! as FollowReset).reason,
        FollowResetReason.rewritten,
      );
    },
  );

  test('S-100 · a refusal of a command is read as the HTTP error is', () {
    final FollowRefused refused =
        read(
              commandError(
                correlationId: 'cmd-1',
                code: 'TRANSCRIPT_FOLLOW_LIMIT',
                messageKey: 'transcript.error.followLimit',
                params: <String, Object?>{'limit': 8, 'scope': 'connection'},
              ),
            )!
            as FollowRefused;

    expect(refused.commandId, 'cmd-1');
    expect(refused.failure, isA<ServerFailure>());
    expect(refused.failure.code, 'TRANSCRIPT_FOLLOW_LIMIT');
    expect(refused.failure.params['limit'], '8');
  });

  test('a frame that is not the follow\'s, or does not carry what it must, is nothing', () {
    final List<String> unreadable = <String>[
      // Not a frame of a followed conversation.
      messageCompleted(messageId: 'm1', text: 'hi', seq: 1),
      // An error that answers no command is the session's to report.
      commandError(correlationId: null),
      // An ack with nothing to answer, and frames of a subscription with no number — which the
      // envelope refuses for an event, and so only another kind could bring.
      frame(kind: 'ack', type: 'transcript.following', payload: <String, Object?>{}),
      frame(kind: 'ack', type: 'transcript.appended', payload: <String, Object?>{'followId': 't'}),
      frame(kind: 'ack', type: 'transcript.reset', payload: <String, Object?>{'followId': 't'}),
      // Payloads missing what the contract requires, or carrying it in another shape.
      withPayload(
        transcriptFollowing(correlationId: 'c'),
        (Map<String, Object?> p) => p.remove('followId'),
      ),
      withPayload(transcriptAppended(seq: 1), (Map<String, Object?> p) => p['working'] = 'yes'),
      withPayload(transcriptAppended(seq: 1), (Map<String, Object?> p) => p['events'] = 'none'),
      withPayload(
        transcriptAppended(seq: 1),
        (Map<String, Object?> p) => p['events'] = <Object?>['an entry'],
      ),
      withPayload(
        transcriptAppended(seq: 1),
        (Map<String, Object?> p) => p['events'] = <Object?>[
          <String, Object?>{'type': 'message.completed', 'payload': 'text'},
        ],
      ),
      withPayload(transcriptAppended(seq: 1), (Map<String, Object?> p) => p['lastMessageId'] = 4),
      withPayload(transcriptAppended(seq: 1), (Map<String, Object?> p) => p.remove('activity')),
      withPayload(transcriptReset(seq: 1), (Map<String, Object?> p) => p.remove('reason')),
    ];

    for (final String raw in unreadable) {
      expect(read(raw), isNull, reason: raw);
    }
  });

  test('a log of a frame says ids, counts and states — never what an entry says', () {
    final FollowAppended appended =
        read(
              transcriptAppended(
                seq: 4,
                raws: <String>[messageCompleted(messageId: 'm5', text: 'a secret', seq: 1)],
                lastMessageId: 'u-44',
                working: true,
              ),
            )!
            as FollowAppended;

    expect(followLogFieldsOf(appended), <String, Object?>{
      'type': 'transcript.appended',
      'followId': 't-1',
      'seq': 4,
      'events': 1,
      'lastMessageId': 'u-44',
      'activity': 'activeElsewhere',
      'working': true,
    });
    expect(followLogFieldsOf(read(transcriptFollowing(correlationId: 'c'))!), <String, Object?>{
      'type': 'transcript.following',
      'followId': 't-1',
      'conversationId': 'conv-1',
      'activity': 'activeElsewhere',
    });
    expect(followLogFieldsOf(read(transcriptReset(seq: 5))!), <String, Object?>{
      'type': 'transcript.reset',
      'followId': 't-1',
      'seq': 5,
      'reason': 'rewritten',
    });
    expect(followLogFieldsOf(read(commandError(correlationId: 'cmd-9'))!), <String, Object?>{
      'type': 'error',
      'commandId': 'cmd-9',
      'code': 'INVALID_INPUT',
    });
  });
}
