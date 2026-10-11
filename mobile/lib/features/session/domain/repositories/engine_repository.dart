/// What reading the engines of the installation needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/engine.dart';

/// The engines this installation drives.
abstract interface class EngineRepository {
  /// @throws [Failure] never an exception of the transport — `UNAUTHENTICATED`, or an answer this
  ///   build cannot read
  Future<EngineCatalogue> list();
}
