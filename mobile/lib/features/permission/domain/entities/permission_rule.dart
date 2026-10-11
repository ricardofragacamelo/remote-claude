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
/// and that cannot depend on the clock of whatever device is looking. [disabled] is a rule written
/// for an agent in a form this version cannot carry over: it answers nothing, and can only be revoked
/// (plan 28, D-18). [unknown] is a state added after this build shipped, shown as what it is rather
/// than guessed at.
enum RuleStatus { active, expired, disabled, unknown }

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
    required this.pattern,
    required this.decision,
    required this.grantedBy,
    required this.grantedAt,
    required this.expiresAt,
    required this.status,
    this.kind,
    this.projectPath,
    this.engine,
    this.disabledReason,
  });

  final String id;

  /// `project` or `always` — the only two that outlive a session.
  final PermissionScope scope;

  /// The kind of call the rule answers (`shell`, `file.edit`), as the server read it from the
  /// pattern. `null` on a disabled rule, whose pattern was never carried over.
  final String? kind;

  /// Exactly as granted, in the canonical grammar — `shell(git status:*)` —, shown and never parsed:
  /// the server is the one that reads it. A disabled rule keeps the pattern it was written with.
  final String pattern;

  final PermissionDecision decision;

  /// The workspace root a `project` rule is confined to; `null` on `always`.
  final String? projectPath;

  /// Who granted it. Always the person looking, since nobody sees another person's rules.
  final String grantedBy;

  final DateTime grantedAt;
  final DateTime expiresAt;
  final RuleStatus status;

  /// The engine the rule is restricted to; `null` when it holds for every agent with the kind.
  final String? engine;

  /// Why the rule answers nothing any more — a code, `untranslatable` —, when it was disabled.
  final String? disabledReason;

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
    kind,
    pattern,
    decision,
    projectPath,
    grantedBy,
    grantedAt,
    expiresAt,
    status,
    engine,
    disabledReason,
  ];
}
