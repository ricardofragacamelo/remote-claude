/// Reads the backend's `GET /engines/claude/usage/rate-limits` payload as [RateLimitWindow]s.
///
/// Read by the generated types of the contract — after checking the shape first: the generated
/// readers assert their fields, which is right for a frame this app built and wrong for an answer
/// from the network (`mobile/lib/core/network/contracts/frame_codec.dart`). A window whose
/// `observedAt` does not parse is dropped whole, rather than shown with an invented instant.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';

/// The status named by [raw] — a value this app does not know is read as [RateLimitStatus.allowed],
/// the least alarming reading, rather than thrown: the survival rule the backend's own mapper
/// follows for a message variant it does not recognise.
RateLimitStatus _statusFrom(String raw) => switch (raw) {
  'allowedWarning' => RateLimitStatus.allowedWarning,
  'rejected' => RateLimitStatus.rejected,
  _ => RateLimitStatus.allowed,
};

bool _looksLikeWindow(Map<String, Object?> payload) =>
    payload['kind'] is String && payload['status'] is String;

/// [payload], with the fields the contract requires but might arrive the wrong shape read as a
/// safe absence rather than failing the whole window.
Map<String, Object?> _normalized(Map<String, Object?> payload) => <String, Object?>{
  ...payload,
  'utilizationPercent': payload['utilizationPercent'] is int ? payload['utilizationPercent'] : null,
  'resetsAt': payload['resetsAt'] is String ? payload['resetsAt'] : null,
  'observedAt': payload['observedAt'] is String ? payload['observedAt'] : '',
};

/// The window in [payload], or `null` when the answer is not one this app can read.
RateLimitWindow? rateLimitWindowFrom(Object? payload) {
  if (payload is! Map<String, Object?> || !_looksLikeWindow(payload)) {
    return null;
  }

  final wire.RateLimitsViewPayloadWindowsItem body = wire.RateLimitsViewPayloadWindowsItem.fromJson(
    _normalized(payload),
  );
  final DateTime? observedAt = DateTime.tryParse(body.observedAt);

  if (observedAt == null) {
    return null;
  }

  return RateLimitWindow(
    kind: body.kind,
    status: _statusFrom(body.status),
    utilizationPercent: body.utilizationPercent,
    resetsAt: body.resetsAt == null ? null : DateTime.tryParse(body.resetsAt!),
    observedAt: observedAt,
    displayName: body.displayName,
  );
}

/// The windows of a `GET /engines/claude/usage/rate-limits` body.
List<RateLimitWindow> rateLimitWindowsFrom(Object? body) {
  final Object? windows = body is Map<String, Object?> ? body['windows'] : null;

  if (windows is! List<Object?>) {
    return <RateLimitWindow>[];
  }

  return windows.map(rateLimitWindowFrom).whereType<RateLimitWindow>().toList(growable: false);
}
