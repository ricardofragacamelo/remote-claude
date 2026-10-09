/// One folder: a new session, the sessions open in it, and its history (plan 10, F8, D-24).
///
/// In the mould of the web's "Claude sessions" view. Each section loads on its own, so a failure
/// of the history never hides the open sessions, nor the other way round (S-159).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/help_button.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/core/widgets/section_heading.dart';
import 'package:remote_claude/features/files/files.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/transcript/transcript.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// How many conversations of the history the folder shows before "See all".
const int folderHistoryPreview = 5;

/// The screen of [workspacePath]: three sections, each loading on its own.
class FolderPage extends ConsumerWidget {
  const FolderPage({required this.workspacePath, super.key});

  final String workspacePath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return AppScreen(
      title: folderNameOf(workspacePath),
      // The folder's files, without a session open (plan 25, D-05): the same panel as the session's.
      endDrawer: FilesPanel(folder: workspacePath),
      actions: <Widget>[
        FilesPanel.button(),
        HelpButton(tooltip: l10n.folderHelpOpen, body: l10n.folderHelpBody),
      ],
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(conversationListControllerProvider(workspacePath));
          await ref.read(folderSessionsControllerProvider(workspacePath).notifier).reload();
        },
        child: ListView(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, Tokens.spaceSm, Tokens.spaceMd, 0),
              child: Text(workspacePath, style: identifierStyle(context)),
            ),
            _newSession(context, ref, l10n),
            SectionHeading(l10n.folderOpenSessions),
            _openSessions(context, ref, l10n),
            SectionHeading(l10n.folderHistory),
            _history(context, ref, l10n),
          ],
        ),
      ),
    );
  }

  /// Reads the open sessions again — on coming back to the folder.
  void _reread(WidgetRef ref) =>
      unawaited(ref.read(folderSessionsControllerProvider(workspacePath).notifier).reload());

  /// The draft of the folder — nothing runs until its first prompt (D-05). Off without a
  /// connection, saying why: a dead control with no reason is a rule that looks like a bug.
  Widget _newSession(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    final bool connected = ref.watch(connectionStatusProvider).value == ConnectionStatus.ready;

    return ContentColumn(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        FilledButton.icon(
          icon: const Icon(Icons.add_comment_outlined),
          label: Text(l10n.folderNewSession),
          onPressed: connected
              ? () =>
                    unawaited(context.push(draftRouteFor(workspacePath)).then((_) => _reread(ref)))
              : null,
        ),
        if (!connected) NoteLine(l10n.folderNewSessionOffline),
      ],
    );
  }

  /// What runs in the folder and below it, from every device.
  Widget _openSessions(BuildContext context, WidgetRef ref, AppLocalizations l10n) =>
      LoadedView<List<LiveSessionSummary>>(
        value: ref.watch(folderSessionsControllerProvider(workspacePath)),
        labels: LoadedLabels(
          loading: l10n.folderSessionsLoading,
          emptyTitle: l10n.folderNoOpenSessions,
          emptyDescription: l10n.folderNoOpenSessionsBody,
        ),
        isEmpty: (List<LiveSessionSummary> sessions) => sessions.isEmpty,
        onRetry: () => _reread(ref),
        builder: (List<LiveSessionSummary> sessions) => Column(
          children: <Widget>[
            for (final LiveSessionSummary session in sessions)
              LiveSessionTile(
                session: session,
                folder: workspacePath,
                // Its screen puts it in the folder's panel once it knows where it runs (F9).
                onTap: () => unawaited(
                  context.push(sessionRouteFor(session.sessionId)).then((_) => _reread(ref)),
                ),
              ),
          ],
        ),
      );

  /// The newest conversations of the folder, and the way to all of them.
  Widget _history(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    final AsyncValue<ConversationBoard> board = ref.watch(
      conversationListControllerProvider(workspacePath),
    );
    final List<ConversationSummary> newest = <ConversationSummary>[
      ...?board.value?.conversations.take(folderHistoryPreview),
    ];

    return LoadedView<ConversationBoard>(
      value: board,
      labels: LoadedLabels(
        loading: l10n.folderSessionsLoading,
        emptyTitle: l10n.folderHistoryEmpty,
        emptyDescription: '',
      ),
      isEmpty: (ConversationBoard _) => newest.isEmpty,
      onRetry: () => ref.invalidate(conversationListControllerProvider(workspacePath)),
      builder: (ConversationBoard _) => Column(
        children: <Widget>[
          for (final ConversationSummary conversation in newest)
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline),
              title: Text(
                conversation.summary.isEmpty ? l10n.historyUntitled : conversation.summary,
              ),
              onTap: () => unawaited(
                context.push(conversationRouteFor(conversation.conversationId, conversation.cwd)),
              ),
            ),
          ListTile(
            leading: const Icon(Icons.history),
            title: Text(l10n.folderHistorySeeAll),
            onTap: () => unawaited(context.push(historyRouteFor(workspacePath))),
          ),
        ],
      ),
    );
  }
}
