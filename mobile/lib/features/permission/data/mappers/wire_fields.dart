/// The three readings every permission payload needs, written once.
///
/// Both mappers of this feature read the same kinds of field — a string, an instant, a decision —
/// and two copies of "a string, or nothing" are two chances for one of them to start accepting a
/// number.
library;

import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// The string at [key], or `null` when it is absent or not a string.
String? wireText(Map<String, Object?> payload, String key) {
  final Object? value = payload[key];
  return value is String ? value : null;
}

/// The instant at [key], or `null` when it is absent or not ISO 8601.
DateTime? wireInstant(Map<String, Object?> payload, String key) {
  final String? value = wireText(payload, key);
  return value == null ? null : DateTime.tryParse(value);
}

/// The decision at [key], or `null` for anything but the two there are.
PermissionDecision? wireDecision(Map<String, Object?> payload, String key) =>
    switch (wireText(payload, key)) {
      'allow' => PermissionDecision.allow,
      'deny' => PermissionDecision.deny,
      _ => null,
    };
