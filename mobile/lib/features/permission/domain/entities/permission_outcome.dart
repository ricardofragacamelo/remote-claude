/// How a question stopped being a question.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// Which client answered, as far as the backend can honestly tell.
enum AnswerOrigin { web, mobile, unknown }

/// The settlement of one request.
///
/// It is what the server **published**, not what this phone sent: the first answer wins, and the
/// decision that reached the agent is not necessarily the one tapped here. Losing that race is not
/// an error — the card leaves saying who won (docs/architecture/mobile/06-testing.md, item 5).
class PermissionOutcome extends Equatable {
  const PermissionOutcome({
    required this.requestId,
    required this.decision,
    required this.auto,
    this.origin = AnswerOrigin.unknown,
    this.expired = false,
  });

  /// The deadline passed with nobody answering — on the server, or on this screen's countdown.
  ///
  /// Silence never authorises, so it is always a refusal, and it carries no author.
  const PermissionOutcome.expired(this.requestId)
    : decision = PermissionDecision.deny,
      auto = true,
      origin = AnswerOrigin.unknown,
      expired = true;

  final String requestId;
  final PermissionDecision decision;

  /// The server decided, with nobody answering: the deadline, or a rule — of this session, this
  /// project or every project.
  final bool auto;

  /// Where the answer came from, when a person gave it.
  final AnswerOrigin origin;

  /// The deadline refused it.
  final bool expired;

  @override
  List<Object?> get props => <Object?>[requestId, decision, auto, origin, expired];
}
