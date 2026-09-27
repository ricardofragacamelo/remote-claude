/// The command menu of one session: what its installation offers.
///
/// The controller is the only layer that knows both sides: the sheet above, the use case below.
library;

import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'command_menu_controller.g.dart';

/// The menu, keyed by the session whose installation it describes.
///
/// Read when the menu is opened and let go when it closes: the installation can change between two
/// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
/// never reaches the composer — the menu is discovery, not a boundary (S-31).
@riverpod
class CommandMenuController extends _$CommandMenuController {
  @override
  Future<CommandMenu> build(String sessionId) => ref.watch(listCommandsProvider)(sessionId);

  /// Reads the menu again, after it could not be read.
  ///
  /// The failure stays on screen until the new answer replaces it — Riverpod keeps the last error
  /// through a reload — so the sheet never flashes an empty state between the two.
  void reload() => ref.invalidateSelf();
}
