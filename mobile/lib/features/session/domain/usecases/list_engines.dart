/// Reading the engines of the installation. One use case, one thing it does.
library;

import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/repositories/engine_repository.dart';

/// The engines enabled, and what each can do — before any session exists.
class ListEngines {
  const ListEngines(this._engines);

  final EngineRepository _engines;

  Future<EngineCatalogue> call() => _engines.list();
}
