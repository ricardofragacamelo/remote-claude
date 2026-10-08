/// One conversation of the history, read-only, and the way to continue it.
///
/// The conversation on screen is navigation state, so it comes from the route. The four states are
/// all here, and "load earlier" puts the page before the oldest one read in front of it: the first
/// page is the **latest** messages, because the intent of opening a conversation is to continue it
/// and a conversation reads like a chat (04 · D-02).
///
/// While it is on screen the conversation is **followed** (plan 22, F4): what another client writes
/// joins it, the notice that something else is writing it comes and goes with the activity,
/// continuing a conversation that is active asks first — as the web does —, and "Working in another
/// client…" says, as the inference it is, that a turn seems to be running there.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/confirm_dialog.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/session/presentation/providers/conversation_history_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The history of one conversation.
class ConversationHistoryPage extends ConsumerStatefulWidget {
  const ConversationHistoryPage({required this.conversationId, super.key});

  /// Which conversation of Claude's store. It comes from the route, never from a provider.
  final String conversationId;

  @override
  ConsumerState<ConversationHistoryPage> createState() => _ConversationHistoryPageState();
}

class _ConversationHistoryPageState extends ConsumerState<ConversationHistoryPage> {
  /// Lets the following go in the background and takes it up again on return (S-93).
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onStateChange: (AppLifecycleState lifecycle) => ref
          .read(conversationHistoryControllerProvider(widget.conversationId).notifier)
          .lifecycleChanged(lifecycle),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String conversationId = widget.conversationId;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ConversationHistoryControllerProvider provider = conversationHistoryControllerProvider(
      conversationId,
    );
    final AsyncValue<HistoryBoard> value = ref.watch(provider);
    final HistoryBoard? board = value.value;

    // The session that continues the conversation answers later, on the socket. Listening rather
    // than awaiting is what it takes — the same as opening one from the folder list (S-75).
    ref.listen<ResumeState>(resumeControllerProvider(conversationId), (
      ResumeState? previous,
      ResumeState next,
    ) {
      final String? sessionId = next.sessionId;

      if (sessionId != null) {
        ref.read(resumeControllerProvider(conversationId).notifier).acknowledge();
        context.go(sessionRouteFor(sessionId));
      }
    });

    return AppScreen(
      title: l10n.historyConversationTitle,
      body: Column(
        children: <Widget>[
          Expanded(
            child: LoadedView<HistoryBoard>(
              value: value,
              labels: LoadedLabels(
                loading: l10n.historyConversationLoading,
                emptyTitle: l10n.historyConversationEmptyTitle,
                emptyDescription: l10n.historyConversationEmptyBody,
              ),
              isEmpty: (HistoryBoard board) => board.isEmpty,
              onRetry: () => unawaited(ref.read(provider.notifier).reload()),
              builder: (HistoryBoard board) => _History(
                board: board,
                onEarlier: () => unawaited(ref.read(provider.notifier).loadEarlier()),
              ),
            ),
          ),
          // Resuming needs to know where the conversation ran, and only a page that was read
          // says so. An empty conversation can still be resumed, so it is not inside the content.
          if (board != null) _ResumeBar(conversationId: conversationId, board: board),
        ],
      ),
    );
  }
}

/// The messages read so far, with the way to the ones before them on top.
class _History extends StatelessWidget {
  const _History({required this.board, required this.onEarlier});

  final HistoryBoard board;
  final VoidCallback onEarlier;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Failure? failure = board.earlierFailure;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (board.summary.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, Tokens.spaceMd, Tokens.spaceMd, 0),
            child: Text(board.summary, style: Theme.of(context).textTheme.titleSmall),
          ),
        if (board.nextCursor != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                TextButton(
                  onPressed: board.isLoadingEarlier ? null : onEarlier,
                  child: Text(
                    board.isLoadingEarlier ? l10n.historyLoadingMore : l10n.historyLoadEarlier,
                  ),
                ),
                if (failure != null) FailureLine(failure: failure),
              ],
            ),
          ),
        Expanded(
          child: ConversationView(
            conversation: board.conversation,
            conversationId: board.latest.conversationId,
            countsUnseen: true,
          ),
        ),
      ],
    );
  }
}

/// Continuing the conversation, and everything the person should know before they do.
class _ResumeBar extends ConsumerWidget {
  const _ResumeBar({required this.conversationId, required this.board});

  final String conversationId;
  final HistoryBoard board;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ResumeState resume = ref.watch(resumeControllerProvider(conversationId));
    final bool connected =
        connectionOf(ref.watch(connectionStatusProvider)) == ConnectionStatus.ready;
    final Failure? failure = resume.failure;

    final Failure? notFollowed = board.followFailure;

    return ContentColumn(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // An inference, said as one — the help says why — and announced as it comes and goes,
        // without taking the focus (plan 22, D-12, S-98).
        if (board.working)
          MessageStrip(
            message: BannerMessage(
              icon: Icons.more_horiz,
              title: l10n.historyFollowWorking,
              body: l10n.historyFollowWorkingHelp,
            ),
          ),
        // The conversation stays readable; it just does not grow by itself (S-100).
        if (notFollowed != null) FailureLine(failure: notFollowed),
        // The promise is editor → phone, and only that: a conversation that began elsewhere goes
        // on under a new id, and the editor will never see what is said here. The screen says so
        // before anybody resumes it, not after (D-04).
        if (board.beganElsewhere) NoteLine(l10n.historyExternalNote),
        if (board.isActiveElsewhere)
          Semantics(liveRegion: true, child: NoteLine(l10n.historyActiveElsewhereNote)),
        // Disabled with the reason said out loud, never disabled in silence.
        if (!connected) NoteLine(l10n.historyResumeOffline),
        if (resume.wasNotSent) NoteLine(l10n.historyResumeNotSent),
        if (failure != null) FailureLine(failure: failure),
        const SizedBox(height: Tokens.spaceSm),
        FilledButton(
          onPressed: connected && !resume.isPending ? () => unawaited(_resume(context, ref)) : null,
          child: Text(resume.isPending ? l10n.historyResumePending : l10n.historyResumeAction),
        ),
      ],
    );
  }

  /// Continues the conversation — after asking, when something else is writing it now: continuing it
  /// here makes a copy that diverges from it (S-97, as the web's `ForkDialog`).
  Future<void> _resume(BuildContext context, WidgetRef ref) async {
    final bool confirmed =
        !board.isActiveElsewhere ||
        (await showDialog<bool>(
              context: context,
              builder: (BuildContext _) => const ForkDialog(),
            ) ??
            false);

    if (confirmed) {
      ref.read(resumeControllerProvider(conversationId).notifier).resume(board.workspacePath);
    }
  }
}

/// "Continue a conversation that is being written now?" — the way out first, where the focus starts.
class ForkDialog extends StatelessWidget {
  const ForkDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return ConfirmDialog(
      title: l10n.sessionForkTitle,
      body: l10n.sessionForkDescription,
      keep: l10n.sessionForkCancel,
      confirm: l10n.sessionForkConfirm,
    );
  }
}
