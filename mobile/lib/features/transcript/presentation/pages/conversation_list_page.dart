/// The conversations of one workspace — the second level of the history (04 · D-03).
///
/// The first level is the list of workspaces, which is the allowlist: the fence the history is
/// read within is visible in the navigation rather than a filter somebody may not notice. Every
/// row says where the conversation began, because one that began elsewhere showing up is a
/// feature, and without the label it would look like data leaking from somewhere (S-11).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_origin.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';
import 'package:remote_claude/features/transcript/presentation/providers/conversation_list_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The screen that lists the conversations of [workspacePath].
class ConversationListPage extends ConsumerWidget {
  const ConversationListPage({required this.workspacePath, super.key});

  /// Which workspace. It comes from the route.
  final String workspacePath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ConversationListControllerProvider provider = conversationListControllerProvider(
      workspacePath,
    );

    return AppScreen(
      title: l10n.historyListTitle,
      body: LoadedView<ConversationBoard>(
        value: ref.watch(provider),
        labels: LoadedLabels(
          loading: l10n.historyListLoading,
          emptyTitle: l10n.historyListEmptyTitle,
          emptyDescription: l10n.historyListEmptyBody,
        ),
        isEmpty: (ConversationBoard board) => board.conversations.isEmpty,
        onRetry: () => unawaited(ref.read(provider.notifier).reload()),
        builder: (ConversationBoard board) => _Conversations(
          workspacePath: workspacePath,
          board: board,
          onMore: () => unawaited(ref.read(provider.notifier).loadMore()),
        ),
      ),
    );
  }
}

/// The loaded list, the folder it belongs to above it and the next page below it.
class _Conversations extends StatelessWidget {
  const _Conversations({required this.workspacePath, required this.board, required this.onMore});

  final String workspacePath;
  final ConversationBoard board;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final List<ConversationSummary> conversations = board.conversations;
    final bool hasMore = board.nextCursor != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: Text(workspacePath, style: identifierStyle(context)),
        ),
        Expanded(
          // A builder rather than a column in a scroll view: one workspace measured 154
          // conversations.
          child: ListView.builder(
            itemCount: conversations.length + (hasMore ? 1 : 0),
            itemBuilder: (BuildContext context, int index) => index < conversations.length
                ? _Row(conversation: conversations[index])
                : _More(board: board, onMore: onMore),
          ),
        ),
      ],
    );
  }
}

/// One conversation: what it is about, where it began, when it was last active.
class _Row extends StatelessWidget {
  const _Row({required this.conversation});

  final ConversationSummary conversation;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final MaterialLocalizations dates = MaterialLocalizations.of(context);
    final DateTime at = conversation.lastModified.toLocal();
    final String? branch = conversation.gitBranch;
    final bool isOurs = conversation.origin == ConversationOrigin.ours;

    return ListTile(
      // Said with an icon **and** words: nothing here depends on colour alone.
      leading: Icon(isOurs ? Icons.phone_android : Icons.terminal),
      title: Text(conversation.summary.isEmpty ? l10n.historyUntitled : conversation.summary),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(isOurs ? l10n.historyOriginOurs : l10n.historyOriginExternal),
          Text(
            l10n.historyLastActive(
              '${dates.formatMediumDate(at)} ${dates.formatTimeOfDay(TimeOfDay.fromDateTime(at))}',
            ),
          ),
          if (branch != null) Text(l10n.historyBranch(branch), style: identifierStyle(context)),
        ],
      ),
      isThreeLine: true,
      onTap: () => unawaited(
        context.push(conversationRouteFor(conversation.conversationId, conversation.cwd)),
      ),
    );
  }
}

/// The next page, and why it did not come when it did not.
class _More extends StatelessWidget {
  const _More({required this.board, required this.onMore});

  final ConversationBoard board;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? failure = board.moreFailure;

    return Padding(
      padding: const EdgeInsets.all(Tokens.spaceMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          OutlinedButton(
            onPressed: board.isLoadingMore ? null : onMore,
            child: Text(board.isLoadingMore ? l10n.historyLoadingMore : l10n.historyLoadMore),
          ),
          if (failure != null) FailureLine(failure: failure),
        ],
      ),
    );
  }
}
