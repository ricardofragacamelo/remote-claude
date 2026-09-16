/// Turns a `messageKey` from the wire into a translated sentence.
///
/// The backend sends `common.error.notFound`; the ARB catalogue exposes `commonErrorNotFound` as
/// a getter, because a generated getter is what makes a missing key a **compile** error. This is
/// the one place that knows both spellings, and it is exhaustive on purpose: a key nobody mapped
/// would otherwise reach a screen as a raw dotted string.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The translated message for a failure.
///
/// An unmapped key falls back to the generic message rather than showing the key itself: a user
/// looking at `session.error.notFound` learns nothing, and the `traceId` next to it is what makes
/// the report actionable anyway.
String translateFailure(AppLocalizations l10n, Failure failure) {
  switch (failure.messageKey) {
    case 'common.error.offline':
      return l10n.commonErrorOffline;
    case 'common.error.invalidInput':
      return l10n.commonErrorInvalidInput;
    case 'common.error.notFound':
      return l10n.commonErrorNotFound;
    case 'common.error.forbidden':
      return l10n.commonErrorForbidden;
    case 'common.error.payloadTooLarge':
      return l10n.commonErrorPayloadTooLarge;
    case 'common.error.rateLimited':
      return l10n.commonErrorRateLimited;
    case 'auth.error.unauthenticated':
      return l10n.authErrorUnauthenticated;
    case 'auth.error.tokenExpired':
      return l10n.authErrorTokenExpired;
    case 'auth.error.invalidState':
      return l10n.authErrorInvalidState;
    case 'connection.error.unsupportedVersion':
      return l10n.connectionErrorUnsupportedVersion;
    case 'session.error.notFound':
      return l10n.sessionErrorNotFound;
    case 'session.error.invalidSessionId':
      return l10n.sessionErrorInvalidSessionId(failure.params['sessionId'] ?? '');
    default:
      return l10n.commonErrorUnexpected;
  }
}
