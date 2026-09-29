/// Why the last start from this app was refused, until the next one — plan 05, S-41.
///
/// Beside the list of folders rather than in a passing notice: the refusal says what to do (end a
/// session, and try again), and a notice gone in four seconds leaves the person with a folder that
/// did nothing when tapped.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/features/session/presentation/providers/session_starter_controller.dart';

/// The refusal of the last start, translated — or nothing, when there is none.
class SessionStartRefusal extends ConsumerWidget {
  const SessionStartRefusal({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Failure? failure = ref.watch(
      sessionStarterControllerProvider.select((SessionStart start) => start.failure),
    );

    return failure == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: Tokens.spaceMd),
            child: FailureLine(failure: failure),
          );
  }
}
