/// What following a conversation of the history is made of (plan 22, B-24).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

import '../../../../../support/builders/conversations.dart';

void main() {
  test('two updates that say the same thing are equal, and differ by what they say', () {
    final FollowAppended appended = FollowAppended(
      followId: 't-1',
      conversation: conversationOf('conv-1'),
      seq: 1,
      working: true,
      lastMessageId: 'u-44',
      activity: ConversationActivity.activeElsewhere,
    );
    const Failure limit = ServerFailure(
      code: 'TRANSCRIPT_FOLLOW_LIMIT',
      messageKey: 'transcript.error.followLimit',
      traceId: 't',
    );

    expect(
      appended,
      FollowAppended(
        followId: 't-1',
        conversation: conversationOf('conv-1'),
        seq: 1,
        working: true,
        lastMessageId: 'u-44',
        activity: ConversationActivity.activeElsewhere,
      ),
    );
    expect(
      appended,
      isNot(
        FollowAppended(
          followId: 't-1',
          conversation: conversationOf('conv-1'),
          seq: 1,
          working: false,
        ),
      ),
    );
    expect(
      const FollowRefused(commandId: 'c-1', failure: limit),
      const FollowRefused(commandId: 'c-1', failure: limit),
    );
    expect(
      const FollowRefused(commandId: 'c-1', failure: limit),
      isNot(const FollowRefused(commandId: 'c-2', failure: limit)),
    );
    expect(
      FollowStarted(commandId: 'c', followId: 't', conversation: conversationOf('conv')),
      isNot(
        FollowStarted(
          commandId: 'c',
          followId: 't',
          conversation: conversationOf('conv'),
          activity: ConversationActivity.idle,
        ),
      ),
    );
    expect(
      FollowReset(
        followId: 't',
        conversation: conversationOf('conv'),
        seq: 2,
        reason: FollowResetReason.gone,
      ),
      isNot(
        FollowReset(
          followId: 't',
          conversation: conversationOf('conv'),
          seq: 2,
          reason: FollowResetReason.rewritten,
        ),
      ),
    );
  });
}
