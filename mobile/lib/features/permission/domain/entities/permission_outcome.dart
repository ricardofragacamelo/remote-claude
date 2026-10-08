/// How a question stopped being a question.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// Which client answered, as far as the backend can honestly tell.
enum AnswerOrigin { web, mobile, unknown }

/// What answered a request nobody was asked about: a rule, or Permitir tudo (plan 23, B-17).
enum AnswerVia { rule, allowAll }

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
    this.toolUseId,
    this.via,
  });

  /// The deadline passed with nobody answering — on the server, or on this screen's countdown.
  ///
  /// Silence never authorises, so it is always a refusal, and it carries no author.
  const PermissionOutcome.expired(this.requestId, {this.toolUseId})
    : decision = PermissionDecision.deny,
      auto = true,
      origin = AnswerOrigin.unknown,
      expired = true,
      via = null;

  final String requestId;
  final PermissionDecision decision;

  /// The server decided, with nobody answering: the deadline, or a rule — of this session, this
  /// project or every project.
  final bool auto;

  /// Where the answer came from, when a person gave it.
  final AnswerOrigin origin;

  /// The deadline refused it.
  final bool expired;

  /// The tool the request was about, when the queue knew the question — what lets the conversation
  /// say the decision on that tool's line (plan 10, B-20). The settlement itself does not carry it.
  final String? toolUseId;

  /// What answered when nobody was asked, when the server said: a rule, or Permitir tudo.
  final AnswerVia? via;

  /// The same settlement, about [tool].
  PermissionOutcome about(String? tool) => PermissionOutcome(
    requestId: requestId,
    decision: decision,
    auto: auto,
    origin: origin,
    expired: expired,
    toolUseId: tool ?? toolUseId,
    via: via,
  );

  @override
  List<Object?> get props => <Object?>[requestId, decision, auto, origin, expired, toolUseId, via];
}
