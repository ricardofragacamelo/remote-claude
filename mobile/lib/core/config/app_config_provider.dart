/// The build's configuration, the address chosen, and the configuration that follows from both, as
/// providers.
///
/// Declared next to the thing they provide, not in a central DI file: a provider that lives with its
/// subject moves with it, and nothing has to be kept in step by hand.
///
/// [appConfigProvider] is **derived** from the origin chosen (plan 10, B-28): the HTTP client, the
/// socket and the login all watch it, so changing the address rebuilds the three on the new origin,
/// and nothing of the old one is left to answer (S-101, S-102).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_config_provider.g.dart';

/// What the build was compiled with.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on purpose: an
/// app running with configuration nobody supplied is the failure this is meant to prevent, and a
/// silent default would hide it.
@Riverpod(keepAlive: true)
BuildConfig buildConfig(Ref ref) =>
    throw StateError('buildConfigProvider must be overridden at boot');

/// The choice of address the phone had saved when the app started — read before the first frame,
/// and overridden at boot with it. `null`: none saved.
@Riverpod(keepAlive: true)
ConnectionChoice? savedConnection(Ref ref) => null;

/// The choice of address, and where it leads.
class ConnectionSetting extends Equatable {
  const ConnectionSetting({required this.resolution, this.saved});

  /// What the person saved, if anything.
  final ConnectionChoice? saved;

  /// The origin the app talks through, and how it came to be that one.
  final ConnectionResolution resolution;

  @override
  List<Object?> get props => <Object?>[saved, resolution];
}

/// The address the app talks through, and the way to change it.
@Riverpod(keepAlive: true)
class ConnectionController extends _$ConnectionController {
  @override
  ConnectionSetting build() {
    final ConnectionChoice? saved = ref.watch(savedConnectionProvider);

    return ConnectionSetting(
      saved: saved,
      resolution: ref.watch(buildConfigProvider).origins.resolve(saved),
    );
  }

  /// Saves [choice] on the phone, and talks through its origin from now on.
  ///
  /// The same choice again does nothing at all — nothing written, nothing rebuilt (S-103) — and a
  /// choice with no origin to use is refused here too, whatever the screen allowed.
  ///
  /// @returns whether the origin changed: what ends the login, because the token is another
  ///   issuer's (D-13)
  Future<bool> save(ConnectionChoice choice) async {
    final String? origin = ref.read(buildConfigProvider).origins.of(choice);

    if (origin == null || (choice == state.saved && origin == state.resolution.origin)) {
      return false;
    }

    await ConnectionStore(
      ref.read(credentialStoreProvider),
      logger: ref.read(appLoggerProvider),
    ).write(choice);

    final bool moved = origin != state.resolution.origin;
    state = ConnectionSetting(
      saved: choice,
      resolution: ConnectionResolution(origin: origin, kind: choice.kind),
    );

    return moved;
  }
}

/// The origin the app talks through, or `null` when there is none yet.
@Riverpod(keepAlive: true)
String? currentOrigin(Ref ref) => ref.watch(connectionControllerProvider).resolution.origin;

/// Whether there is an origin to talk through — what keeps the app on the address screen until there
/// is (D-17).
@Riverpod(keepAlive: true)
bool hasOrigin(Ref ref) => ref.watch(currentOriginProvider) != null;

/// The configuration, on the origin chosen.
///
/// It throws with no origin: everything that reads it sits behind the address screen, which the
/// router keeps on screen until there is one.
@Riverpod(keepAlive: true)
AppConfig appConfig(Ref ref) {
  final String? origin = ref.watch(currentOriginProvider);

  if (origin == null) {
    throw StateError('no address to talk to the server through has been chosen yet');
  }

  return AppConfig.at(ref.watch(buildConfigProvider), origin);
}
