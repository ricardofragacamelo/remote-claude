/// Failures, the only way a problem travels above `data/`.
///
/// An exception crossing a layer is how an error becomes a crash in production. The conversion
/// happens in `data/`, and everything above works with this sealed type.
///
/// `code` and `messageKey` are **the same strings the backend sends** — see
/// docs/architecture/shared/04-errors-and-http.md. The UI translates `messageKey`; logic branches
/// on `code`, never on a transport status.
library;

import 'package:equatable/equatable.dart';

/// Something that went wrong, in the shape the UI reacts to.
sealed class Failure extends Equatable {
  const Failure({
    required this.code,
    required this.messageKey,
    required this.traceId,
    this.params = const <String, String>{},
    this.details = const <FailureDetail>[],
  });

  /// Stable identifier from the error catalogue. Changing one is a breaking change.
  final String code;

  /// Key the client translates. The server never sends prose.
  final String messageKey;

  /// Correlates this failure with the server logs of the same operation.
  final String traceId;

  /// Interpolation values for [messageKey].
  final Map<String, String> params;

  /// Validation only: every invalid field, not just the first.
  final List<FailureDetail> details;

  @override
  List<Object?> get props => <Object?>[code, messageKey, traceId, params, details];
}

/// One invalid field, as the server reported it.
class FailureDetail extends Equatable {
  const FailureDetail({required this.field, required this.rule});

  /// Name of the field the server refused.
  final String field;

  /// Which rule it broke.
  final String rule;

  @override
  List<Object?> get props => <Object?>[field, rule];
}

/// The request never reached a server: no route, a timeout, a socket that would not open.
final class NetworkFailure extends Failure {
  const NetworkFailure({required super.traceId})
    : super(code: 'NETWORK_UNREACHABLE', messageKey: 'common.error.offline');
}

/// The credential is missing, rejected or expired.
final class AuthenticationFailure extends Failure {
  const AuthenticationFailure({
    required super.traceId,
    super.code = 'UNAUTHENTICATED',
    super.messageKey = 'auth.error.unauthenticated',
  });
}

/// The server answered with an error envelope of its own.
final class ServerFailure extends Failure {
  const ServerFailure({
    required super.code,
    required super.messageKey,
    required super.traceId,
    super.params,
    super.details,
  });
}

/// Anything that does not look like a failure we know how to name.
final class UnexpectedFailure extends Failure {
  const UnexpectedFailure({required super.traceId})
    : super(code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected');
}

/// The trace of a failure that never came from a request, and so never had one.
///
/// A dash rather than an empty string: the error view renders the trace, and a blank space where
/// an identifier should be reads as a bug in the screen instead of an absence of information.
const String unknownTraceId = '-';

/// Any error, read as a [Failure].
///
/// Anything that is not one already becomes [UnexpectedFailure]. Above `data/` a raw exception has
/// no code, no trace and nothing the UI can translate — and the screen still owes the person a
/// sentence, so the conversion happens here rather than in each screen's own way.
Failure asFailure(Object error) =>
    error is Failure ? error : const UnexpectedFailure(traceId: unknownTraceId);
