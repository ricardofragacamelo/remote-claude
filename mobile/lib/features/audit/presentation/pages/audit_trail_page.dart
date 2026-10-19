/// The trail of one session's calls of one kind: a read-only list, reached only from the tool card's
/// own "Trail" link — no filter form, no entry in a menu (plan 26, B-32, D-11).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/tool_label_words.dart';
import 'package:remote_claude/features/audit/presentation/providers/audit_trail_controller.dart';
import 'package:remote_claude/features/audit/presentation/widgets/audit_entry_tile.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The trail screen, for [sessionId]'s calls of [kind].
class AuditTrailPage extends ConsumerWidget {
  const AuditTrailPage({required this.sessionId, required this.kind, super.key});

  final String sessionId;
  final String kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final provider = auditTrailControllerProvider(sessionId, kind);
    final AuditTrailController controller = ref.read(provider.notifier);

    return AppScreen(
      title: l10n.auditTrailTitle(kindNameOrGeneric(l10n, kind)),
      body: LoadedView<AuditTrailBoard>(
        value: ref.watch(provider),
        labels: LoadedLabels(
          loading: l10n.auditTrailLoading,
          emptyTitle: l10n.auditTrailEmptyTitle,
          emptyDescription: l10n.auditTrailEmptyDescription,
        ),
        isEmpty: (AuditTrailBoard board) => board.entries.isEmpty,
        onRetry: controller.retry,
        builder: (AuditTrailBoard board) => _Entries(board: board, controller: controller),
      ),
    );
  }
}

class _Entries extends StatelessWidget {
  const _Entries({required this.board, required this.controller});

  final AuditTrailBoard board;
  final AuditTrailController controller;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: board.entries.length + (board.hasMore ? 1 : 0),
      separatorBuilder: (BuildContext _, int _) => const Divider(height: 1),
      itemBuilder: (BuildContext _, int index) {
        if (index >= board.entries.length) {
          return _LoadMore(board: board, onTap: controller.loadMore);
        }

        return AuditEntryTile(entry: board.entries[index]);
      },
    );
  }
}

class _LoadMore extends StatelessWidget {
  const _LoadMore({required this.board, required this.onTap});

  final AuditTrailBoard board;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (board.loadingMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(child: Text(l10n.auditTrailLoadingMore)),
      );
    }

    final failure = board.moreFailure;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: <Widget>[
          if (failure != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                failureText(context, failure),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          TextButton(onPressed: onTap, child: Text(l10n.auditTrailLoadMore)),
        ],
      ),
    );
  }
}
