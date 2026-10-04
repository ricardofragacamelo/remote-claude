/// Which address the app talks to the server through (plan 10, B-28): the internal one, the
/// external one — both compiled in (D-12) — or another, typed by the person.
///
/// Pure Dart. Resolving a choice against what the build defines is a function, so the defaults of a
/// first launch (D-17) and a choice the build no longer offers are rules a test can name.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/config/connection_origin.dart';

/// The three radios of the address screen.
enum ConnectionKind { internal, external, other }

/// What the person chose, and what they typed in the field of [ConnectionKind.other] — kept even
/// with another radio chosen, so coming back to it finds the text (D-18).
class ConnectionChoice extends Equatable {
  const ConnectionChoice(this.kind, {this.other = ''});

  final ConnectionKind kind;
  final String other;

  @override
  List<Object?> get props => <Object?>[kind, other];
}

/// Why the address on screen is not the one that was chosen.
enum ConnectionNotice {
  /// The choice saved names an address this build no longer defines: the default stands instead.
  choiceUnavailable,
}

/// The address the app talks through, and how it came to be that one.
class ConnectionResolution extends Equatable {
  const ConnectionResolution({this.origin, this.kind, this.notice});

  /// The origin — `null` when there is none to use: the app opens on the address screen (D-17).
  final String? origin;

  /// The radio it came from.
  final ConnectionKind? kind;
  final ConnectionNotice? notice;

  @override
  List<Object?> get props => <Object?>[origin, kind, notice];
}

/// The origins this build defines, by radio — an empty define is a radio that is off (D-12).
class DefinedOrigins extends Equatable {
  const DefinedOrigins({this.internal, this.external});

  final String? internal;
  final String? external;

  /// The origin of [choice], when it names one that exists and is valid.
  String? of(ConnectionChoice choice) => switch (choice.kind) {
    ConnectionKind.internal => internal,
    ConnectionKind.external => external,
    ConnectionKind.other => switch (checkOrigin(choice.other)) {
      ValidOrigin(:final String origin) => origin,
      InvalidOrigin() => null,
    },
  };

  /// What a first launch talks through: the internal address, else the external one (D-17).
  ConnectionResolution get byDefault => internal != null
      ? ConnectionResolution(origin: internal, kind: ConnectionKind.internal)
      : external != null
      ? ConnectionResolution(origin: external, kind: ConnectionKind.external)
      : const ConnectionResolution();

  /// Where [saved] leads: its origin, or the default — saying why, when a choice was saved and
  /// cannot be used any more (S-100).
  ConnectionResolution resolve(ConnectionChoice? saved) {
    final String? origin = saved == null ? null : of(saved);

    if (saved != null && origin != null) {
      return ConnectionResolution(origin: origin, kind: saved.kind);
    }

    final ConnectionResolution fallback = byDefault;

    return saved == null
        ? fallback
        : ConnectionResolution(
            origin: fallback.origin,
            kind: fallback.kind,
            notice: ConnectionNotice.choiceUnavailable,
          );
  }

  @override
  List<Object?> get props => <Object?>[internal, external];
}
