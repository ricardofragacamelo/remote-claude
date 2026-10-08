/// What following a conversation of the history is made of (plan 22, B-24).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

void main() {
  test('two updates that say the same thing are equal, and differ by what they say', () {
    const FollowAppended appended = FollowAppended(
      followId: 't-1',
      conversationId: 'conv-1',
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
      const FollowAppended(
        followId: 't-1',
        conversationId: 'conv-1',
        seq: 1,
        working: true,
        lastMessageId: 'u-44',
        activity: ConversationActivity.activeElsewhere,
      ),
    );
    expect(
      appended,
      isNot(
        const FollowAppended(followId: 't-1', conversationId: 'conv-1', seq: 1, working: false),
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
      const FollowStarted(commandId: 'c', followId: 't', conversationId: 'conv'),
      isNot(
        const FollowStarted(
          commandId: 'c',
          followId: 't',
          conversationId: 'conv',
          activity: ConversationActivity.idle,
        ),
      ),
    );
    expect(
      const FollowReset(
        followId: 't',
        conversationId: 'conv',
        seq: 2,
        reason: FollowResetReason.gone,
      ),
      isNot(
        const FollowReset(
          followId: 't',
          conversationId: 'conv',
          seq: 2,
          reason: FollowResetReason.rewritten,
        ),
      ),
    );
  });
}
