/// Something the user authorised in advance, as the rules screen knows it.
///
/// Pure Dart, and the one rule about time takes the time as an argument: a rule that read the clock
/// by itself would be a rule nobody could test (docs/architecture/mobile/01-architecture.md).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// Whether a rule still answers, as the server computed it.
///
/// The server's and never the phone's: the list shows an expired rule marked rather than missing,
/// and that cannot depend on the clock of whatever device is looking. [unknown] is a state added
/// after this build shipped, shown as what it is rather than guessed at.
enum RuleStatus { active, expired, unknown }

/// How close to its expiry a rule is flagged.
///
/// Seven days and not thirty: with the default lifetime of ninety, thirty would keep a third of
/// every rule's life under a warning, and a permanent warning is one nobody reads
/// ([D-13](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
const Duration expiryWarning = Duration(days: 7);

/// One rule.
///
/// `always` means, in practice, "don't ask me again" — which is why every field that says how far
/// it reaches is here, and why none of them is optional.
class PermissionRule extends Equatable {
  const PermissionRule({
    required this.id,
    required this.scope,
    required this.toolName,
    required this.pattern,
    required this.decision,
    required this.grantedBy,
    required this.grantedAt,
    required this.expiresAt,
    required this.status,
    this.projectPath,
  });

  final String id;

  /// `project` or `always` — the only two that outlive a session.
  final PermissionScope scope;

  final String toolName;

  /// Exactly as granted, in the grammar of the Claude Code settings.
  final String pattern;

  final PermissionDecision decision;

  /// The workspace root a `project` rule is confined to; `null` on `always`.
  final String? projectPath;

  /// Who granted it. Always the person looking, since nobody sees another person's rules.
  final String grantedBy;

  final DateTime grantedAt;
  final DateTime expiresAt;
  final RuleStatus status;

  /// Whether it is about to stop answering at [now].
  ///
  /// Without the warning a session starts asking again with no explanation: the convenience is
  /// lost, and the loss is not explained. An expired rule is not "about to" — it already did.
  bool isExpiringSoonAt(DateTime now) =>
      status == RuleStatus.active && expiresAt.difference(now) < expiryWarning;

  @override
  List<Object?> get props => <Object?>[
    id,
    scope,
    toolName,
    pattern,
    decision,
    projectPath,
    grantedBy,
    grantedAt,
    expiresAt,
    status,
  ];
}
