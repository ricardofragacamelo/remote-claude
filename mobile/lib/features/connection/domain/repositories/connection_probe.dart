/// Asking an address, before talking through it, whether the server and its login are there.
library;

import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';

/// Tests an origin: the server's health and the discovery of the login derived from it.
abstract interface class ConnectionProbe {
  /// Asks [origin], whose login sits at [issuer].
  Future<ProbeResult> probe({required String origin, required String issuer});
}
