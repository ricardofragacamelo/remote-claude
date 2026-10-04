/// What this installation is allowed to do, said in words.
///
/// It exists because of one rule: while the device is pending the app **watches sessions and does
/// not decide**, and the controls that decide are disabled **with the reason on screen**. Hiding
/// the reason turns a security rule into an apparent bug — somebody taps a dead button and
/// concludes the app is broken (docs/architecture/mobile/07-auth.md).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/presentation/providers/device_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The approval state of this installation, as a card.
class DeviceStatusBanner extends ConsumerWidget {
  const DeviceStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      deviceStatusMessage(
        AppLocalizations.of(context),
        ref.watch(deviceControllerProvider),
      )?.banner() ??
      const SizedBox.shrink();
}

/// The approval state of this installation, as one line that opens the card — the session screen,
/// where the conversation is the only thing with room (plan 10, B-07).
class DeviceStatusLine extends ConsumerWidget {
  const DeviceStatusLine({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final BannerMessage? message = deviceStatusMessage(
      AppLocalizations.of(context),
      ref.watch(deviceControllerProvider),
    );

    return message == null ? const SizedBox.shrink() : MessageStrip(message: message);
  }
}

/// What to say about one state of the registration, or `null` when there is nothing to say.
///
/// It reads what the state **means**, not what class it is. A build that failed while the
/// provider was still settling arrives as an `AsyncLoading` that carries an error, and a switch
/// over the three classes matches the loading case first — which would leave "registering…" on
/// screen for ever, for the one person whose registration did not go through.
BannerMessage? deviceStatusMessage(AppLocalizations l10n, AsyncValue<RegisteredDevice?> device) {
  final Object? failure = device.error;

  if (failure != null) {
    return BannerMessage(
      icon: Icons.error_outline,
      emphasis: true,
      title: l10n.deviceStatusUnknownTitle,
      body: failure is Failure ? translateFailure(l10n, failure) : l10n.deviceStatusUnknownBody,
    );
  }

  if (!device.hasValue) {
    return BannerMessage(
      icon: Icons.hourglass_empty,
      title: l10n.deviceStatusRegisteringTitle,
      body: l10n.deviceStatusRegisteringBody,
    );
  }

  return _forDevice(l10n, device.value);
}

BannerMessage? _forDevice(AppLocalizations l10n, RegisteredDevice? device) =>
    switch (device?.status) {
      // Nothing to say: the controls work, and a banner that says "everything is fine" is a banner
      // people stop reading.
      null || DeviceStatus.approved => null,
      DeviceStatus.pending => BannerMessage(
        icon: Icons.hourglass_top,
        title: l10n.deviceStatusPendingTitle,
        body: l10n.deviceStatusPendingBody,
      ),
      DeviceStatus.revoked => BannerMessage(
        icon: Icons.block,
        emphasis: true,
        title: l10n.deviceStatusRevokedTitle,
        body: l10n.deviceStatusRevokedBody,
      ),
      DeviceStatus.unknown => BannerMessage(
        icon: Icons.help_outline,
        title: l10n.deviceStatusUnknownTitle,
        body: l10n.deviceStatusUnknownBody,
      ),
    };
