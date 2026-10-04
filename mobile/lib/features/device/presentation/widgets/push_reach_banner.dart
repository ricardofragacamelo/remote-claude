/// Whether an approval can reach this phone when nobody is looking at it.
///
/// This is the one path that makes the whole plan pointless without anything failing: the socket
/// works, the session works, the permission request is asked — and nobody is told. So the app
/// **says so in full**, and offers the one thing that can change it
/// ([D-14](../../../../../docs/plans/02-mobile-approval/decisions.md#d-14--o-usuário-que-nega-a-notificação)).
///
/// Refusing to work on a phone whose owner declined notifications would take the product away
/// from somebody who simply prefers to open the app; staying silent would be worse, because they
/// would conclude the product does not notify at all.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/device/presentation/providers/push_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// What notifications can and cannot do on this installation, as a card.
class PushReachBanner extends ConsumerWidget {
  const PushReachBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      pushReachMessage(AppLocalizations.of(context), ref)?.banner() ?? const SizedBox.shrink();
}

/// What notifications can and cannot do, as one line that opens the card — the session screen
/// (plan 10, B-07).
class PushReachLine extends ConsumerWidget {
  const PushReachLine({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final BannerMessage? message = pushReachMessage(AppLocalizations.of(context), ref);
    return message == null ? const SizedBox.shrink() : MessageStrip(message: message);
  }
}

/// What to say about notifications on this installation, or `null` when there is nothing to say.
///
/// Nothing is said while it is being worked out, and nothing is said when it is fine. A banner
/// that reports good news is a banner people stop reading, and then they miss the bad one.
BannerMessage? pushReachMessage(AppLocalizations l10n, WidgetRef ref) {
  final PushReach? reach = ref.watch(pushControllerProvider).value;

  if (reach == null) {
    return null;
  }

  // The rotation comes first: it is the only one of these states the person did not choose, and
  // the only one where notifications look allowed and still do not arrive (S-74).
  if (reach.rotationFailed) {
    return BannerMessage(
      icon: Icons.sync_problem,
      emphasis: true,
      title: l10n.pushRotationFailedTitle,
      body: l10n.pushRotationFailedBody,
      actionLabel: l10n.commonActionRetry,
      onAction: () => ref.read(pushControllerProvider.notifier).recheck(),
    );
  }

  return switch (reach.permission) {
    PushPermission.granted || PushPermission.notAsked => null,

    // The user said no, and can say yes again — but only in the operating system's settings, so
    // that is what the action opens. Prompting a second time shows nothing on Android.
    PushPermission.denied => BannerMessage(
      icon: Icons.notifications_off,
      title: l10n.pushDeniedTitle,
      body: l10n.pushDeniedBody,
      actionLabel: l10n.pushDeniedAction,
      onAction: () => ref.read(pushControllerProvider.notifier).openSettings(),
    ),

    // No transport in this build. Deliberately **not** the sentence above: there is nothing in
    // the settings for them to turn on, and telling somebody they denied a permission they were
    // never asked for is a lie the support thread would take an afternoon to unpick (D-21).
    PushPermission.unavailable => BannerMessage(
      icon: Icons.notifications_paused,
      title: l10n.pushUnavailableTitle,
      body: l10n.pushUnavailableBody,
    ),
  };
}
