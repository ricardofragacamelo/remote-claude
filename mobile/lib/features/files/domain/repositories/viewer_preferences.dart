/// What the viewer remembers on this phone, for every file (plan 25, D-17).
library;

/// The viewer's preferences.
abstract interface class ViewerPreferences {
  /// Whether long lines wrap — on until the person turns it off.
  Future<bool> wrap();

  Future<void> setWrap({required bool wrap});
}
