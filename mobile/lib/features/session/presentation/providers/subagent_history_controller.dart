/// A subagent's own messages, read once when its card opens in the history (plan 26, B-20) — never
/// asked for while the live stream already has something of its own (S-69's own reasoning, ported
/// from the web's `streamed` check).
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'subagent_history_controller.g.dart';

/// Never asked again on its own: a failure stays on screen with "try again" (S-70), and the person
/// decides.
Duration? _neverRetry(int retryCount, Object error) => null;

/// The messages of [toolUseId]'s own subagent, in [conversation].
@Riverpod(retry: _neverRetry)
class SubagentHistoryController extends _$SubagentHistoryController {
  @override
  Future<SubagentPage> build(ConversationKey conversation, String toolUseId) =>
      ref.watch(readSubagentMessagesProvider)(conversation, toolUseId);

  /// Asks again, after it did not arrive.
  void retry() => ref.invalidateSelf();
}
