/// The task list the agent keeps, over the box (plan 10, B-23; 09 · D-14): folded into one line —
/// "3/7 · Running the tests" — that unfolds into the whole list. Nothing when there is no list, or the
/// agent emptied it. It lives outside the conversation, so a list that changes never moves what is
/// being read (S-78).
///
/// It draws the last `session.tasksChanged` as it came — never a list rebuilt from the calls (plan 28,
/// B-22).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The most of the height the unfolded list takes before it scrolls.
const double taskListHeight = 200;

/// The word of a state.
String taskStateWord(AppLocalizations l10n, TaskStatus state) => switch (state) {
  TaskStatus.pending => l10n.sessionTaskPending,
  TaskStatus.inProgress => l10n.sessionTaskInProgress,
  TaskStatus.completed => l10n.sessionTaskCompleted,
};

/// The line the list folds into: how many are done, and what is being done — or what is next.
String taskHeadline(AppLocalizations l10n, List<SessionTask> items) {
  final int done = items.where((SessionTask item) => item.status == TaskStatus.completed).length;

  if (done == items.length) {
    return l10n.sessionTasksAllDone('$done', '${items.length}');
  }

  final SessionTask? doing = items
      .where((SessionTask item) => item.status == TaskStatus.inProgress)
      .firstOrNull;
  final SessionTask? next = items
      .where((SessionTask item) => item.status == TaskStatus.pending)
      .firstOrNull;

  return l10n.sessionTasksHeadline(
    '$done',
    '${items.length}',
    doing?.shownTitle ?? next?.title ?? '',
  );
}

/// The strip of [items].
class TaskStrip extends StatefulWidget {
  const TaskStrip({required this.items, super.key, this.engine});

  final List<SessionTask> items;

  /// The engine that keeps the list, which its label names — the default engine's when `null`.
  final String? engine;

  @override
  State<TaskStrip> createState() => _TaskStripState();
}

class _TaskStripState extends State<TaskStrip> {
  /// Unfolded by a tap. Local: it is where the person is looking, not data.
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final List<SessionTask> items = widget.items;

    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    final AppLocalizations l10n = AppLocalizations.of(context);

    return Semantics(
      label: l10n.sessionTasksLabel(agentNameIn(context, widget.engine)),
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (_open)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: taskListHeight),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
                children: <Widget>[for (final SessionTask item in items) _TaskRow(item: item)],
              ),
            ),
          TextStrip(
            icon: Icons.checklist,
            text: taskHeadline(l10n, items),
            onTap: () => setState(() => _open = !_open),
          ),
        ],
      ),
    );
  }
}

/// One task: its state by icon and by word, and what it is — or what is being done.
class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.item});

  final SessionTask item;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme text = Theme.of(context).textTheme;
    final bool done = item.status == TaskStatus.completed;
    final String what = item.shownTitle;

    return Semantics(
      label: '${taskStateWord(l10n, item.status)}: $what',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Tokens.spaceSm / 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(switch (item.status) {
              TaskStatus.pending => Icons.radio_button_unchecked,
              TaskStatus.inProgress => Icons.timelapse,
              TaskStatus.completed => Icons.check_circle_outline,
            }, size: Tokens.spaceMd),
            const SizedBox(width: Tokens.spaceSm),
            Expanded(
              child: Text(
                what,
                style: text.bodySmall?.copyWith(
                  decoration: done ? TextDecoration.lineThrough : null,
                  fontWeight: item.status == TaskStatus.inProgress ? FontWeight.bold : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
