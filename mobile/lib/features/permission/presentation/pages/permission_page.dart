/// The screen a notification opens: one request, revalidated before anything about it is shown.
///
/// The push may have waited in the tray while the request expired or was answered in the browser,
/// so **nothing here comes from the notification**. The route names the request; the server says
/// where it stands; the socket keeps it current while the screen is open (S-45…S-47, S-49, S-57).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_lookup_controller.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';
import 'package:remote_claude/features/permission/presentation/widgets/answered_questions.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_outcome_line.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_panel.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The screen of one permission request.
class PermissionPage extends ConsumerWidget {
  const PermissionPage({required this.sessionId, required this.requestId, super.key});

  /// Both come from the route, never from the notification's payload.
  final String sessionId;
  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final PermissionLookupProvider lookupProvider = permissionLookupProvider(sessionId, requestId);

    // What the server said is still open goes into the queue, so its countdown runs — and refuses
    // it — even before the socket has re-delivered the question.
    ref.listen<AsyncValue<PermissionLookup>>(lookupProvider, (
      AsyncValue<PermissionLookup>? previous,
      AsyncValue<PermissionLookup> next,
    ) {
      final PermissionLookup? lookup = next.value;
      if (lookup != null) {
        ref.read(permissionQueueControllerProvider(sessionId).notifier).seed(lookup);
      }
    });

    final AsyncValue<PermissionLookup> lookup = ref.watch(lookupProvider);
    final PermissionQueue queue = ref.watch(permissionQueueControllerProvider(sessionId));
    final Object? failure = lookup.error;

    return AppScreen(
      title: l10n.permissionPageTitle,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
            child: DeviceStatusBanner(),
          ),
          Expanded(
            child: failure != null
                ? ErrorView(
                    failure: asFailure(failure),
                    onRetry: () => ref.invalidate(lookupProvider),
                  )
                : _Focus(
                    sessionId: sessionId,
                    requestId: requestId,
                    now: queue.asOf ?? DateTime.now(),
                    focus: focusOf(lookup: lookup.value, queue: queue, requestId: requestId),
                  ),
          ),
        ],
      ),
    );
  }
}

/// What the screen shows, once it knows.
class _Focus extends StatelessWidget {
  const _Focus({
    required this.sessionId,
    required this.requestId,
    required this.now,
    required this.focus,
  });

  final String sessionId;
  final String requestId;
  final DateTime now;
  final PermissionFocus focus;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return switch (focus) {
      FocusChecking() => LoadingView(label: l10n.permissionCheckingTitle),
      // Open: answerable here, and "open the session" lands on the conversation scrolled to this
      // same card, in the place of its tool (plan 10, S-74).
      FocusOpen(:final PermissionCard card) => SingleChildScrollView(
        child: _Over(
          sessionId: sessionId,
          requestId: requestId,
          child: PermissionPanel(sessionId: sessionId, card: card, now: now),
        ),
      ),
      FocusSettled(:final PermissionOutcome outcome) => _Over(
        sessionId: sessionId,
        requestId: requestId,
        child: outcome.interaction == null
            ? PermissionOutcomeLine(outcome: outcome)
            // A question answered elsewhere shows what was answered (plan 24, S-94).
            : AnsweredQuestions(
                interaction: outcome.interaction!,
                answers: outcome.answers,
                end: questionEndOf(outcome),
              ),
      ),
      FocusGone() => _Over(
        sessionId: sessionId,
        requestId: requestId,
        child: EmptyView(title: l10n.permissionGoneTitle, description: l10n.permissionGoneBody),
      ),
    };
  }
}

/// A request, and the way to the session it belongs to.
class _Over extends StatelessWidget {
  const _Over({required this.sessionId, required this.requestId, required this.child});

  final String sessionId;
  final String requestId;
  final Widget child;

  @override
  Widget build(BuildContext context) => ContentColumn(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      child,
      const SizedBox(height: Tokens.spaceMd),
      FilledButton(
        onPressed: () => context.go(sessionRouteFor(sessionId, request: requestId)),
        child: Text(AppLocalizations.of(context).permissionOpenSession),
      ),
    ],
  );
}
