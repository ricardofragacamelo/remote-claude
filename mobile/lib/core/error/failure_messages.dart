/// Turns a `messageKey` from the wire into a translated sentence.
///
/// The backend sends `common.error.notFound`; the ARB catalogue exposes `commonErrorNotFound` as
/// a getter, because a generated getter is what makes a missing key a **compile** error. This is
/// the one place that knows both spellings, and it is exhaustive on purpose: a key nobody mapped
/// would otherwise reach a screen as a raw dotted string.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
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
    case 'auth.error.deviceNotRegistered':
      return l10n.authErrorDeviceNotRegistered;
    case 'auth.error.deviceRevoked':
      return l10n.authErrorDeviceRevoked;
    case 'auth.error.deviceNotFound':
      return l10n.authErrorDeviceNotFound;
    case 'auth.error.deviceApprovalForbidden':
      return l10n.authErrorDeviceApprovalForbidden;
    case 'connection.error.unsupportedVersion':
      return l10n.connectionErrorUnsupportedVersion;
    case 'session.error.notFound':
      return l10n.sessionErrorNotFound;
    case 'session.error.invalidSessionId':
      return l10n.sessionErrorInvalidSessionId(failure.params['sessionId'] ?? '');
    case 'session.error.limitReached':
      return l10n.sessionErrorLimitReached(failure.params['limit'] ?? '');
    case 'session.error.claudeUnavailable':
      return l10n.sessionErrorClaudeUnavailable;
    case 'session.error.claudeTimeout':
      return l10n.sessionErrorClaudeTimeout;
    case 'session.error.resumeTimeout':
      return l10n.sessionErrorResumeTimeout;
    case 'session.error.unknownCommand':
      return l10n.sessionErrorUnknownCommand(failure.params['command'] ?? '');
    case 'session.error.locked':
      return l10n.sessionErrorLocked;
    case 'session.error.queuedPromptStarted':
      return l10n.sessionErrorQueuedPromptStarted;
    case 'session.error.queuedPromptNotFound':
      return l10n.sessionErrorQueuedPromptNotFound;
    case 'session.error.effortUnsupported':
      return l10n.sessionErrorEffortUnsupported(
        failure.params['model'] ?? '',
        failure.params['level'] ?? '',
      );
    case 'session.error.forkRejected':
      return l10n.sessionErrorForkRejected;
    case 'session.error.forkPointUnknown':
      return l10n.sessionErrorForkPointUnknown;
    case 'session.error.rewindTargetUnknown':
      return l10n.sessionErrorRewindTargetUnknown;
    case 'session.error.rewindIncomplete':
      return l10n.sessionErrorRewindIncomplete(failure.params['failed'] ?? '');
    case 'transcript.error.notFound':
      return l10n.transcriptErrorNotFound;
    case 'transcript.error.invalidSessionId':
      return l10n.transcriptErrorInvalidSessionId(failure.params['sessionId'] ?? '');
    case 'transcript.error.claudeUnavailable':
      return l10n.transcriptErrorClaudeUnavailable;
    case 'transcript.error.claudeTimeout':
      return l10n.transcriptErrorClaudeTimeout;
    case 'transcript.error.cursorStale':
      return l10n.transcriptErrorCursorStale;
    case 'permission.error.requestNotFound':
      return l10n.permissionErrorRequestNotFound;
    case 'permission.error.requestExpired':
      return l10n.permissionErrorRequestExpired;
    case 'permission.error.notOwned':
      return l10n.permissionErrorNotOwned;
    case 'permission.error.ruleNotFound':
      return l10n.permissionErrorRuleNotFound;
    case 'permission.error.answersInvalid':
      return l10n.permissionErrorAnswersInvalid;
    default:
      return _groupedMessage(l10n, failure);
  }
}

/// The words of a refusal that a group of its own translates — the folder's, the history's — or the
/// generic one when no group knows the key.
String _groupedMessage(AppLocalizations l10n, Failure failure) =>
    _workspaceMessage(l10n, failure) ??
    _followMessage(l10n, failure) ??
    _filesMessage(l10n, failure) ??
    l10n.commonErrorUnexpected;

/// The words of a refusal about a folder, or `null` when [failure] is not one — apart, so the switch
/// above stays readable as the folder screens add theirs (plan 10, F7).
String? _workspaceMessage(AppLocalizations l10n, Failure failure) => switch (failure.messageKey) {
  'workspace.error.notAllowed' => l10n.workspaceErrorNotAllowed(failure.params['path'] ?? ''),
  'workspace.error.forbidden' => l10n.workspaceErrorForbidden,
  'workspace.error.notFound' => l10n.workspaceErrorNotFound,
  'workspace.error.notADirectory' => l10n.workspaceErrorNotADirectory,
  'workspace.error.directoryUnreadable' => l10n.workspaceErrorDirectoryUnreadable(
    failure.params['path'] ?? '',
  ),
  'workspace.error.openFoldersLimitReached' => l10n.foldersLimitReached(
    failure.params['limit'] ?? '',
  ),
  _ => null,
};

/// The words of a refusal about following a conversation of the history or opening what it holds,
/// or `null` when [failure] is not one — apart, like the folder's (plan 22, B-04).
String? _followMessage(AppLocalizations l10n, Failure failure) => switch (failure.messageKey) {
  'transcript.error.followLimit' => l10n.transcriptErrorFollowLimit(failure.params['limit'] ?? ''),
  'transcript.error.followLiveHere' => l10n.transcriptErrorFollowLiveHere,
  'transcript.error.imageTypeUnsupported' => l10n.transcriptErrorImageTypeUnsupported(
    failure.params['mediaType'] ?? '',
  ),
  'transcript.error.imageTooLarge' => l10n.transcriptErrorImageTooLarge,
  _ => null,
};

/// The words of a refusal about a file of the folder, or `null` when [failure] is not one — what the
/// file browser meets (plan 25, B-06). The ceiling arrives in bytes and is said as a size.
String? _filesMessage(AppLocalizations l10n, Failure failure) {
  final String path = failure.params['path'] ?? '';

  return switch (failure.messageKey) {
    'files.error.notFound' => l10n.filesErrorNotFound(path),
    'files.error.invalidPath' => l10n.filesErrorInvalidPath,
    'files.error.notAFile' => l10n.filesErrorNotAFile(path),
    'files.error.rangeNotSatisfiable' => l10n.filesErrorRangeNotSatisfiable(path),
    'files.error.tooLarge' => l10n.filesErrorTooLarge(path, _size(l10n, failure.params['limit'])),
    'files.error.notText' => l10n.filesErrorNotText(path),
    'files.error.accessDenied' => l10n.filesErrorAccessDenied(path),
    'files.error.changed' => l10n.filesErrorChanged(path),
    _ => null,
  };
}

/// [bytes] as a size in the catalogue's locale — or as it came, when it is not a number.
String _size(AppLocalizations l10n, String? bytes) {
  final int? count = int.tryParse(bytes ?? '');
  return count == null ? bytes ?? '' : formatBytes(count, l10n.localeName);
}
