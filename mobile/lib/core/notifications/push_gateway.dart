/// The app's side of push notification: a port, and nothing about who delivers.
///
/// Receiving a notification on Android needs the supplier's library, and an `import` of it is a
/// line of Dart with the supplier's name in it — which `pnpm scan:security` refuses, correctly
/// (S-26). So the supplier does not cross this boundary: Dart knows a port and a channel named
/// after the product, and the library lives where platform libraries live, in `android/` and in
/// configuration
/// ([D-21](../../../../docs/plans/02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart)).
///
/// It is the same split the backend already makes, where `adapter/outbound/push/` knows an
/// endpoint and a credential and never who answers them.
library;

import 'package:equatable/equatable.dart';

/// Where this installation stands with the operating system's notification permission.
enum PushPermission {
  /// Nobody has been asked yet. Asking is a decision about *when*, and it is not made here.
  notAsked,

  /// Notifications are allowed.
  granted,

  /// The user said no. Recoverable — the operating system's settings can undo it.
  denied,

  /// **This build has no push transport at all.**
  ///
  /// Deliberately not the same as [denied]. A user who refused can change their mind in the
  /// system settings; a build with no transport configured offers them nothing to change, and
  /// telling them "you denied notifications" would be a lie. See D-21.
  unavailable,
}

/// What a notification is about, as it arrives on the device.
///
/// The three fields the payload is allowed to carry, and no more: the push travels through
/// somebody else's server, so there is nothing here that a file's content or a command's output
/// could be put into (S-19, S-20).
class PushArrival extends Equatable {
  const PushArrival({
    required this.sessionId,
    required this.requestId,
    required this.expiresAt,
    required this.isWithdrawal,
  });

  /// The session the question belongs to.
  final String sessionId;

  /// The request being asked about. It is also the notification's tag.
  final String requestId;

  /// When the request stops being worth opening.
  final DateTime expiresAt;

  /// Whether this message exists to **take down** a notification rather than show one.
  ///
  /// A provider cannot withdraw what it already delivered, so the withdrawal is a message of its
  /// own, silent and wordless — the backend sends it when the permission resolves or expires.
  final bool isWithdrawal;

  @override
  List<Object?> get props => <Object?>[sessionId, requestId, expiresAt, isWithdrawal];
}

/// Everything the app needs from the platform's notification transport.
abstract interface class PushGateway {
  /// Where the permission stands, without asking for it.
  Future<PushPermission> permission();

  /// Asks the operating system for the permission, and answers where it landed.
  ///
  /// Asking twice after a refusal shows nothing on Android: the answer is [PushPermission.denied]
  /// again, which is why the UI offers the settings shortcut instead of a second prompt.
  Future<PushPermission> request();

  /// The transport's token for this installation, or `null` when there is none.
  Future<String?> token();

  /// Every token the transport mints from now on.
  ///
  /// The supplier rotates it on its own schedule, and a rotation nobody re-registers is an
  /// approval that silently stops arriving
  /// ([D-13](../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)).
  Stream<String> get tokens;

  /// Notifications reaching the device, whether they are shown or withdrawn.
  Stream<PushArrival> get arrivals;

  /// Notifications the user **tapped**, including the one that started the app.
  Stream<PushArrival> get openings;

  /// Takes down whatever is showing for [requestId].
  Future<void> withdraw(String requestId);

  /// Opens the operating system's notification settings for this app.
  Future<void> openSettings();
}
