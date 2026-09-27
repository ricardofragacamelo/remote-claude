/// The level the app logs at, and the one rule that decides it.
///
/// In `core/` because two places need it and one of them is a feature: the boot, which builds the
/// logger, and the diagnostics screen, which raises the level and puts it back.
library;

import 'package:logging/logging.dart';

/// The level this build logs at.
///
/// `debug` while developing — every I/O edge, with payloads. `info` in a release, where the user
/// can turn `debug` back on from a diagnostics screen: reproducing an intermittent permission bug
/// on a phone needs it, and having to publish a new build to investigate is not workable.
Level levelFor({required bool isRelease, required bool debugRequested}) {
  if (debugRequested || !isRelease) {
    return Level.FINE;
  }

  return Level.INFO;
}
