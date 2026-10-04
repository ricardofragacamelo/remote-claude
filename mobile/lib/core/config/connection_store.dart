/// Where the choice of address is kept on the phone (plan 10, B-28, D-18): the secure store, the
/// only one this app has, under `rc.connection.*` keys — outside [CredentialKeys.all], so signing out
/// never takes it. It survives restarts, logouts and updates; only uninstalling the app, or clearing
/// its data, forgets it.
library;

import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/storage/credential_store.dart';

/// The keys of the choice. Named here so nothing writes one under an ad-hoc string.
abstract final class ConnectionKeys {
  /// The radio, with the version of how it is written: `1:internal`.
  static const String choice = 'rc.connection.choice';

  /// What the field of the third radio holds — kept whichever radio is chosen.
  static const String other = 'rc.connection.other';

  /// Every key of the choice.
  static const List<String> all = <String>[choice, other];
}

/// The version of how a choice is written. A value of another version is one this build cannot
/// read: the default stands, and nothing breaks (S-99).
const String _version = '1';

/// The choice of address, on the phone.
class ConnectionStore {
  const ConnectionStore(this._storage, {this._logger});

  final CredentialStore _storage;
  final AppLogger? _logger;

  /// The choice saved, or `null` — none saved, or one this build cannot read, said with a `warn`.
  Future<ConnectionChoice?> read() async {
    final String? raw = await _storage.read(ConnectionKeys.choice);
    final String other = await _storage.read(ConnectionKeys.other) ?? '';

    if (raw == null) {
      return null;
    }

    final ConnectionKind? kind = _kindOf(raw);

    if (kind == null) {
      _logger?.warn(
        'the saved choice of address is unreadable; the default stands',
        op: 'connection.read',
        fields: <String, Object?>{'value': raw},
      );
      return null;
    }

    return ConnectionChoice(kind, other: other);
  }

  /// Saves [choice] — the radio and the text of the third one.
  Future<void> write(ConnectionChoice choice) async {
    await _storage.write(ConnectionKeys.choice, '$_version:${choice.kind.name}');
    await _storage.write(ConnectionKeys.other, choice.other);
    _logger?.debug(
      'saved the choice of address',
      op: 'connection.write',
      fields: <String, Object?>{'kind': choice.kind.name},
    );
  }

  static ConnectionKind? _kindOf(String raw) {
    final List<String> parts = raw.split(':');

    if (parts.length != 2 || parts.first != _version) {
      return null;
    }

    return ConnectionKind.values
        .where((ConnectionKind kind) => kind.name == parts.last)
        .firstOrNull;
  }
}
