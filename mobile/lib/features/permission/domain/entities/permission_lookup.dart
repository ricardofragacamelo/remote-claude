/// What the server says about one request when it is asked directly — and what the screen a
/// notification opens decides to show.
///
/// A notification is a promise made some time ago by somebody else's server. It may have waited in
/// the tray while the request expired, or while somebody answered it in the browser, so the screen
/// it opens renders **nothing** from its payload: it asks, and shows the answer
/// (docs/architecture/mobile/03-state-and-data.md, S-45…S-47, R-04).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// The server's answer about one request.
///
/// "Expired" and "gone" are states rather than failures: they are the ordinary outcome of a push
/// that arrived late, and the screen has a sentence for each. What is a failure — the network, or
/// a request of somebody else — travels as a `Failure` instead.
sealed class PermissionLookup extends Equatable {
  const PermissionLookup();
}

/// Still open.
final class LookupPending extends PermissionLookup {
  const LookupPending(this.request, {this.remainingExtensions});

  final PermissionRequest request;
  final int? remainingExtensions;

  @override
  List<Object?> get props => <Object?>[request, remainingExtensions];
}

/// Somebody — or a rule — already answered it.
final class LookupSettled extends PermissionLookup {
  const LookupSettled(this.outcome);

  final PermissionOutcome outcome;

  @override
  List<Object?> get props => <Object?>[outcome];
}

/// The deadline refused it (`PERMISSION_REQUEST_EXPIRED`).
final class LookupExpired extends PermissionLookup {
  const LookupExpired();

  @override
  List<Object?> get props => const <Object?>[];
}

/// The server does not know it any more — the session ended, or the backend restarted
/// (`PERMISSION_REQUEST_NOT_FOUND`).
final class LookupGone extends PermissionLookup {
  const LookupGone();

  @override
  List<Object?> get props => const <Object?>[];
}

/// What the screen of one request shows.
sealed class PermissionFocus extends Equatable {
  const PermissionFocus();
}

/// The server has not answered yet. Nothing about the request is on screen — that is the point.
final class FocusChecking extends PermissionFocus {
  const FocusChecking();

  @override
  List<Object?> get props => const <Object?>[];
}

/// Still open, and this is its card.
final class FocusOpen extends PermissionFocus {
  const FocusOpen(this.card);

  final PermissionCard card;

  @override
  List<Object?> get props => <Object?>[card];
}

/// Over, and this is how it ended.
final class FocusSettled extends PermissionFocus {
  const FocusSettled(this.outcome);

  final PermissionOutcome outcome;

  @override
  List<Object?> get props => <Object?>[outcome];
}

/// The server no longer knows it.
final class FocusGone extends PermissionFocus {
  const FocusGone();

  @override
  List<Object?> get props => const <Object?>[];
}

/// Decides what the screen of [requestId] shows.
///
/// [lookup] is `null` while the server has not answered. Until it has, the screen shows that it is
/// checking — **even** when the socket has already delivered the question, because the rule is to
/// revalidate before rendering, and a rule with an exception for "the fast case" is a rule the slow
/// case eventually breaks (S-45).
///
/// Once it has answered, what the stream said since is fresher than the answer, and wins: a request
/// resolved on the web while this screen was open leaves the card on its own (S-49).
PermissionFocus focusOf({
  required PermissionLookup? lookup,
  required PermissionQueue queue,
  required String requestId,
}) {
  if (lookup == null) {
    return const FocusChecking();
  }

  final PermissionOutcome? outcome = queue.outcomeOf(requestId);
  if (outcome != null) {
    return FocusSettled(outcome);
  }

  final PermissionCard? card = queue.cardOf(requestId);
  if (card != null) {
    return FocusOpen(card);
  }

  return switch (lookup) {
    LookupPending(:final PermissionRequest request, :final int? remainingExtensions) => FocusOpen(
      PermissionCard(request: request, remainingExtensions: remainingExtensions),
    ),
    LookupSettled(:final PermissionOutcome outcome) => FocusSettled(outcome),
    LookupExpired() => FocusSettled(PermissionOutcome.expired(requestId)),
    LookupGone() => const FocusGone(),
  };
}
