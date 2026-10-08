/// The mode, the model and the effort, as chips of the composer bar, each opening a sheet
/// (plan 10, B-11).
///
/// The lists are the installation's, never ours: the models come from the session or, in a draft,
/// from the folder's catalogue. `bypassPermissions` — the SDK's mode, which skips the approval — is
/// never offered. Permitir tudo (`allowAll`) is ours, and is (plan 23, ADR-022): the backend still sees
/// every tool, a rule that refuses still refuses, and switching it off asks again at the next tool.
/// `acceptEdits` and `allowAll` **look** different: a warning tone with an icon of their own, never
/// only a colour, and the warning in full in the sheet.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The modes a phone may switch to, in the order the sheet offers them.
const List<String> offeredModes = <String>['default', 'acceptEdits', 'plan', 'allowAll'];

/// The mode the installation opens with when nothing was chosen.
const String defaultMode = 'default';

/// How the models are read: whatever the screen watches, as a list.
typedef ModelsOf = AsyncValue<List<InstallationModel>> Function(WidgetRef ref);

/// The name of [mode], or the mode itself when this build has no words for it.
String modeName(AppLocalizations l10n, String mode) => switch (mode) {
  'default' => l10n.modeDefault,
  'acceptEdits' => l10n.modeAcceptEdits,
  'plan' => l10n.modePlan,
  'allowAll' => l10n.modeAllowAll,
  _ => mode,
};

/// What [mode] does, or nothing for one this build does not know.
String modeDescription(AppLocalizations l10n, String mode) => switch (mode) {
  'default' => l10n.modeDefaultDescription,
  'acceptEdits' => l10n.modeAcceptEditsDescription,
  'plan' => l10n.modePlanDescription,
  'allowAll' => l10n.modeAllowAllDescription,
  _ => '',
};

/// The warning a mode that stops asking carries, in full — or nothing for one that asks.
String? modeWarning(AppLocalizations l10n, String mode) => switch (mode) {
  'acceptEdits' => l10n.modeAcceptEditsWarning,
  'allowAll' => l10n.modeAllowAllWarning,
  _ => null,
};

/// The icon of [mode] on the chip: the two that stop asking have one of their own.
IconData modeIcon(String mode) => switch (mode) {
  'acceptEdits' => Icons.warning_amber,
  'allowAll' => Icons.lock_open,
  _ => Icons.shield_outlined,
};

/// The name of an effort level, or the level itself when this build has no words for it.
String effortName(AppLocalizations l10n, String? level) => switch (level) {
  null => l10n.effortDefault,
  'low' => l10n.effortLow,
  'medium' => l10n.effortMedium,
  'high' => l10n.effortHigh,
  'xhigh' => l10n.effortXhigh,
  'max' => l10n.effortMax,
  _ => level,
};

/// The mode chip.
ComposerChoice modeChoice(
  BuildContext context, {
  required String? current,
  required void Function(String mode) onPick,
  bool isPending = false,
}) {
  final AppLocalizations l10n = AppLocalizations.of(context);
  final String mode = current ?? defaultMode;

  return ComposerChoice(
    label: l10n.modeLabel,
    value: isPending ? l10n.composerChoicePending : modeName(l10n, mode),
    icon: modeIcon(mode),
    warn: modeWarning(l10n, mode) != null,
    onOpen: () => unawaited(
      _openSheet(
        context,
        _PickSheet<String>(
          title: l10n.modeLabel,
          current: mode,
          options: <_Option<String>>[
            for (final String each in offeredModes)
              _Option<String>(
                value: each,
                title: modeName(l10n, each),
                subtitle: <String>[modeDescription(l10n, each), ?modeWarning(l10n, each)].join(' '),
                warn: modeWarning(l10n, each) != null,
              ),
          ],
          onPick: isPending ? null : onPick,
        ),
      ),
    ),
  );
}

/// The model chip.
ComposerChoice modelChoice(
  BuildContext context, {
  required String? current,
  required List<InstallationModel> known,
  required ModelsOf models,
  required void Function(String? model) onPick,
  bool isPending = false,
  bool withDefault = false,
}) {
  final AppLocalizations l10n = AppLocalizations.of(context);

  return ComposerChoice(
    label: l10n.modelLabel,
    value: isPending ? l10n.composerChoicePending : modelName(l10n, current, known),
    icon: Icons.memory,
    onOpen: () => unawaited(
      _openSheet(
        context,
        _ModelSheet(
          current: current,
          models: models,
          withDefault: withDefault,
          onPick: isPending ? null : onPick,
        ),
      ),
    ),
  );
}

/// What to call the model [current]: the installation's name for it, its value, or the default.
String modelName(AppLocalizations l10n, String? current, List<InstallationModel> known) {
  if (current == null) {
    return l10n.modelDefault;
  }

  return modelOf(known, current)?.label ?? current;
}

/// The model of [known] that [current] names, if any.
InstallationModel? modelOf(List<InstallationModel> known, String? current) =>
    known.where((InstallationModel model) => model.value == current).firstOrNull;

/// The effort chip — in a draft, where it is chosen; in a session, read-only (08 · D-16).
///
/// `null` when the model does not take an effort: a chip for something that cannot be set is a
/// question with no answer.
ComposerChoice? effortChoice(
  BuildContext context, {
  required InstallationModel? model,
  required String? current,
  void Function(String? level)? onPick,
  bool isKnown = true,
}) {
  if (model == null || !model.supportsEffort) {
    return null;
  }

  final AppLocalizations l10n = AppLocalizations.of(context);
  final String value = isKnown ? effortName(l10n, current) : l10n.effortUnknown;

  return ComposerChoice(
    label: l10n.effortLabel,
    value: value,
    icon: Icons.speed,
    onOpen: () => unawaited(
      _openSheet(
        context,
        onPick == null
            ? _ReadOnlySheet(title: l10n.effortLabel, value: value, why: l10n.effortReadOnly)
            : _PickSheet<String?>(
                title: l10n.effortLabel,
                current: current,
                options: <_Option<String?>>[
                  _Option<String?>(value: null, title: l10n.effortDefault),
                  for (final String level in model.effortLevels)
                    _Option<String?>(value: level, title: effortName(l10n, level)),
                ],
                onPick: onPick,
              ),
      ),
    ),
  );
}

Future<void> _openSheet(BuildContext context, Widget sheet) =>
    showSheet(context, (BuildContext _) => sheet);

/// One option of a sheet.
class _Option<T> {
  const _Option({required this.value, required this.title, this.subtitle = '', this.warn = false});

  final T value;
  final String title;
  final String subtitle;
  final bool warn;
}

/// A sheet that picks one of [options]. Without [onPick], the options are shown and none can be
/// picked — a change already on its way (S-35).
class _PickSheet<T> extends StatelessWidget {
  const _PickSheet({
    required this.title,
    required this.current,
    required this.options,
    required this.onPick,
  });

  final String title;
  final T current;
  final List<_Option<T>> options;
  final void Function(T value)? onPick;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final void Function(T value)? pick = onPick;

    return ListView(
      shrinkWrap: true,
      children: <Widget>[
        _title(title),
        for (final _Option<T> option in options)
          ListTile(
            selected: option.value == current,
            leading: Icon(
              option.value == current ? Icons.radio_button_checked : Icons.radio_button_unchecked,
            ),
            title: Text(option.title),
            subtitle: option.subtitle.isEmpty
                ? null
                : Text(
                    option.subtitle,
                    style: option.warn ? TextStyle(color: theme.colorScheme.error) : null,
                  ),
            trailing: option.warn
                ? Icon(Icons.warning_amber, color: theme.colorScheme.error)
                : null,
            enabled: pick != null,
            onTap: pick == null
                ? null
                : () {
                    Navigator.of(context).pop();

                    if (option.value != current) {
                      pick(option.value);
                    }
                  },
          ),
      ],
    );
  }
}

/// The models, as the screen reads them — loading, failed, or the list.
class _ModelSheet extends ConsumerWidget {
  const _ModelSheet({
    required this.current,
    required this.models,
    required this.onPick,
    this.withDefault = false,
  });

  final String? current;
  final ModelsOf models;
  final void Function(String? model)? onPick;

  /// A draft may leave the model to the installation; a session runs one.
  final bool withDefault;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<InstallationModel>> listed = models(ref);
    final Object? failure = listed.error;

    if (failure != null) {
      // The list could not be had: the chip keeps the model in use, and the box goes on.
      return _ReadOnlySheet(
        title: l10n.modelLabel,
        value: modelName(l10n, current, const <InstallationModel>[]),
        why: l10n.modelsFailed(
          failure is Failure ? translateFailure(l10n, failure) : l10n.commonErrorUnexpected,
        ),
      );
    }

    final List<InstallationModel>? found = listed.value;

    if (found == null) {
      return _ReadOnlySheet(title: l10n.modelLabel, value: l10n.modelsLoading, why: '');
    }

    return _PickSheet<String?>(
      title: l10n.modelLabel,
      current: current,
      options: <_Option<String?>>[
        if (withDefault) _Option<String?>(value: null, title: l10n.modelDefault),
        for (final InstallationModel model in found)
          _Option<String?>(value: model.value, title: model.label, subtitle: model.description),
      ],
      onPick: onPick,
    );
  }
}

/// A sheet that says what a choice is set to and why it cannot change here.
class _ReadOnlySheet extends StatelessWidget {
  const _ReadOnlySheet({required this.title, required this.value, required this.why});

  final String title;
  final String value;
  final String why;

  @override
  Widget build(BuildContext context) => ContentColumn(
    children: <Widget>[
      _title(title),
      Text(value, style: Theme.of(context).textTheme.titleMedium),
      if (why.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: Tokens.spaceSm),
          child: Text(why, style: Theme.of(context).textTheme.bodyMedium),
        ),
    ],
  );
}

/// The title of a sheet of a choice.
Widget _title(String text) => SheetHeading(
  text,
  large: true,
  padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, 0, Tokens.spaceMd, Tokens.spaceSm),
);
