/// What has been said in a session, and what has run in it.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The messages and tools of one conversation, in the order they arrived.
class ConversationView extends StatelessWidget {
  const ConversationView({required this.conversation, super.key});

  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final List<Widget> items = <Widget>[
      for (final StreamMessage message in conversation.messages) _Message(message: message),
      for (final ToolExecution tool in conversation.tools) ToolCard(tool: tool),
    ];

    return ListView.separated(
      padding: const EdgeInsets.all(Tokens.spaceMd),
      itemCount: items.length + (conversation.lastTurn == null ? 0 : 1),
      separatorBuilder: (BuildContext context, int index) => const SizedBox(height: Tokens.spaceSm),
      itemBuilder: (BuildContext context, int index) =>
          index < items.length ? items[index] : _Turn(turn: conversation.lastTurn!),
    );
  }
}

/// One message. Still streaming, or whole.
class _Message extends StatelessWidget {
  const _Message({required this.message});

  final StreamMessage message;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Align(
      alignment: message.isFromUser
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: Card(
        color: message.isFromUser ? theme.colorScheme.secondaryContainer : null,
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: Text(message.text, style: theme.textTheme.bodyMedium),
        ),
      ),
    );
  }
}

/// What the last finished turn cost.
///
/// Shown rather than kept for a report: this is somebody's own money, spent by a process they
/// started from a phone, and it should not take a dashboard to find out.
class _Turn extends StatelessWidget {
  const _Turn({required this.turn});

  final TurnSummary turn;

  @override
  Widget build(BuildContext context) => Text(
    AppLocalizations.of(context).sessionTurnCost(turn.costUsd, turn.durationMs),
    style: Theme.of(context).textTheme.labelSmall,
  );
}
