/// The part of the session screen that only shows: the conversation — or the reason there is not one
/// yet.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/message_actions.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The conversation, or the reason there is not one yet.
class SessionBody extends StatelessWidget {
  const SessionBody({
    required this.session,
    required this.connection,
    super.key,
    this.inline,
    this.working,
    this.prompts,
  });

  final LiveSession session;
  final ConnectionStatus connection;

  /// The questions, in the places of their tools (B-20).
  final InlineQuestions? inline;

  /// The line of the turn that runs (B-18).
  final Widget? working;

  /// What can be done from a prompt (B-24).
  final PromptActions? prompts;

  @override
  Widget build(BuildContext context) {
    final Conversation conversation = session.conversation;
    final bool asks = inline?.queue.pending.isNotEmpty ?? false;

    // A question — or a turn — with nothing said yet is still something to show, in its place.
    if (!conversation.isEmpty || asks || working != null) {
      return ConversationView(
        conversation: conversation,
        conversationId: conversation.facts.conversationId,
        inline: inline,
        working: working,
        prompts: prompts,
      );
    }

    final AppLocalizations l10n = AppLocalizations.of(context);

    // Nothing has arrived. Which of the reasons it is decides what the person reads: a socket still
    // opening is a wait, history being read is a wait too, and a socket that is gone is not.
    final bool waiting = const <ConnectionStatus>{
      ConnectionStatus.connecting,
      ConnectionStatus.reconnecting,
      ConnectionStatus.throttled,
    }.contains(connection);

    // In a scroll of its own: at a large font on a small phone, the reason can be taller than the
    // room the box and the strips leave (S-24).
    if (waiting) {
      return SingleChildScrollView(child: LoadingView(label: connectionLabel(l10n, connection)));
    }

    // The history being read, or failing, is said in its line above; nothing goes in its place.
    if (session.isLoadingHistory || session.historyFailure != null) {
      return const SizedBox.shrink();
    }

    return SingleChildScrollView(
      child: EmptyView(title: l10n.sessionEmptyTitle, description: l10n.sessionEmptyBody),
    );
  }
}
