/// The two things almost every screen's `build` reads off its context before doing anything else.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Shorthand for `AppLocalizations.of(context)` and `Theme.of(context)`.
extension ScreenContext on BuildContext {
  /// The strings of the current locale.
  AppLocalizations get l10n => AppLocalizations.of(this);

  /// The current theme.
  ThemeData get theme => Theme.of(this);
}
