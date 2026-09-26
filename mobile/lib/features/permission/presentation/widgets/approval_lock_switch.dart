/// The switch that turns the fingerprint-or-PIN prompt before an approval on and off.
///
/// "On by default, and can be turned off" (docs/architecture/mobile/07-auth.md#biometria). What it
/// turns off is the **prompt**, not the rule behind it: a phone with no lock does not approve with
/// the switch in either position (D-25).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_lookup_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The approval lock preference of this phone.
class ApprovalLockSwitch extends ConsumerWidget {
  const ApprovalLockSwitch({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ApprovalLockState? state = ref.watch(approvalLockControllerProvider).value;
    final AppLocalizations l10n = AppLocalizations.of(context);

    return SwitchListTile(
      title: Text(l10n.approvalLockTitle),
      subtitle: Text(state?.hasLock == false ? l10n.permissionNoLockBody : l10n.approvalLockBody),
      // On while undecided: the safe position is the default, and a switch that flickers off while
      // the store answers would say the opposite of what is true.
      value: state?.isRequired ?? true,
      onChanged: state == null
          ? null
          : (bool required) =>
                ref.read(approvalLockControllerProvider.notifier).change(required: required),
    );
  }
}
