// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'remote-claude';

  @override
  String get commonActionRetry => 'Try again';

  @override
  String get commonActionSignOut => 'Sign out';

  @override
  String get commonErrorUnexpected => 'Something went wrong on our side.';

  @override
  String get commonErrorOffline => 'The backend could not be reached.';

  @override
  String get commonErrorInvalidInput => 'The request was not valid.';

  @override
  String get commonErrorNotFound => 'That does not exist.';

  @override
  String get commonErrorForbidden => 'You are not allowed to do that.';

  @override
  String get commonErrorPayloadTooLarge => 'That is larger than the server accepts.';

  @override
  String get commonErrorRateLimited => 'Too many requests. Try again in a moment.';

  @override
  String commonErrorTraceLabel(String traceId) {
    return 'Trace $traceId';
  }

  @override
  String get authErrorUnauthenticated => 'Please sign in again.';

  @override
  String get authErrorTokenExpired => 'Your session expired.';

  @override
  String get authErrorInvalidState => 'The sign-in reply did not match the request.';

  @override
  String get authSignInTitle => 'Sign in to continue';

  @override
  String get authSignInDescription =>
      'remote-claude runs Claude Code on your own machine, so it asks who you are first.';

  @override
  String get authSignInAction => 'Sign in';

  @override
  String get authSignInPending => 'Finishing sign-in…';

  @override
  String get connectionErrorUnsupportedVersion =>
      'This build speaks an older protocol. Update the app.';

  @override
  String get connectionStatusIdle => 'Not connected';

  @override
  String get connectionStatusConnecting => 'Connecting…';

  @override
  String get connectionStatusReady => 'Connected';

  @override
  String get connectionStatusReconnecting => 'Reconnecting…';

  @override
  String get connectionStatusClosed => 'Disconnected';

  @override
  String get sessionPingTitle => 'Round trip';

  @override
  String get sessionPingDescription =>
      'One command across every layer: the gateway, the use case, the rule, the database and back as an event.';

  @override
  String get sessionPingAction => 'Send ping';

  @override
  String get sessionPingPending => 'Waiting for the pong…';

  @override
  String get sessionPingEmpty => 'No round trip yet. Send one to see the whole chain work.';

  @override
  String sessionPingResult(int count, String at) {
    return 'Pong $count at $at';
  }

  @override
  String sessionPingSequence(int seq) {
    return 'Sequence $seq';
  }

  @override
  String sessionPingSessionLabel(String sessionId) {
    return 'Session $sessionId';
  }

  @override
  String get sessionErrorNotFound => 'That session no longer exists.';

  @override
  String sessionErrorInvalidSessionId(String sessionId) {
    return '$sessionId is not a session identifier.';
  }

  @override
  String get deviceStatusRegisteringTitle => 'Registering this device';

  @override
  String get deviceStatusRegisteringBody => 'Telling the backend which device this is.';

  @override
  String get deviceStatusPendingTitle => 'Waiting for approval';

  @override
  String get deviceStatusPendingBody =>
      'You can watch sessions from here. Approving a tool needs this device approved first, and that is done from the browser on your machine.';

  @override
  String get deviceStatusRevokedTitle => 'This device was revoked';

  @override
  String get deviceStatusRevokedBody =>
      'It can no longer answer permission requests. Approve it again from the browser on your machine, or sign out.';

  @override
  String get deviceStatusUnknownTitle => 'This device is not registered';

  @override
  String get deviceStatusUnknownBody =>
      'You can watch sessions. Approving a tool is off until the registration goes through.';

  @override
  String get authErrorDeviceNotRegistered => 'This device is not approved yet.';

  @override
  String get authErrorDeviceRevoked => 'This device has been revoked.';

  @override
  String get authErrorDeviceNotFound => 'That device does not exist.';

  @override
  String get authErrorDeviceApprovalForbidden =>
      'A device cannot approve a device. Use the browser.';

  @override
  String get pushDeniedTitle => 'Notifications are off';

  @override
  String get pushDeniedBody =>
      'Without notifications, you will only see an approval request while this app is open. You can turn them on in the system settings.';

  @override
  String get pushDeniedAction => 'Open settings';

  @override
  String get pushUnavailableTitle => 'Notifications are not available';

  @override
  String get pushUnavailableBody =>
      'This build cannot receive notifications. Approval works while the app is open, and there is nothing to change in the system settings.';

  @override
  String get pushRotationFailedTitle => 'Notifications may not arrive';

  @override
  String get pushRotationFailedBody =>
      'This device got a new notification address and it could not be registered. Approval from away may not reach you until it is.';

  @override
  String get workspaceListTitle => 'Workspaces';

  @override
  String get workspaceListDescription => 'Pick a folder to open a session in.';

  @override
  String get workspaceListLoading => 'Loading folders';

  @override
  String get workspaceListEmptyTitle => 'No folders yet';

  @override
  String get workspaceListEmptyBody =>
      'Nothing is on the allowlist. It is set on the machine running the backend, not from here.';

  @override
  String get workspaceNeverOpened => 'Never opened';

  @override
  String get workspaceStartRefused => 'The session was not opened: this device is not connected.';

  @override
  String get sessionTitle => 'Session';

  @override
  String get sessionEmptyTitle => 'Nothing yet';

  @override
  String get sessionEmptyBody => 'Send a prompt to start.';

  @override
  String get sessionPromptHint => 'Ask Claude something';

  @override
  String get sessionPromptAction => 'Send';

  @override
  String get sessionPromptRefused => 'Not sent: this device is not connected.';

  @override
  String get sessionInterruptAction => 'Stop';

  @override
  String get sessionCloseAction => 'End session';

  @override
  String get sessionStatusStarting => 'Starting';

  @override
  String get sessionStatusIdle => 'Idle';

  @override
  String get sessionStatusThinking => 'Thinking';

  @override
  String get sessionStatusRunning => 'Running a tool';

  @override
  String get sessionStatusWaitingPermission => 'Waiting for approval';

  @override
  String get sessionStatusClosed => 'Closed';

  @override
  String get sessionToolStatusRunning => 'Running';

  @override
  String get sessionToolStatusSucceeded => 'Succeeded';

  @override
  String get sessionToolStatusFailed => 'Failed';

  @override
  String get sessionToolStatusDenied => 'Denied';

  @override
  String get sessionToolOutputLabel => 'Output';

  @override
  String sessionTurnCost(String costUsd, int durationMs) {
    return '$costUsd USD in $durationMs ms';
  }

  @override
  String get sessionClosedByUser => 'Ended by whoever opened it.';

  @override
  String get sessionClosedCompleted => 'Finished on its own.';

  @override
  String get sessionClosedFailed => 'Ended after a failure.';

  @override
  String get sessionClosedAuditUnavailable => 'Ended because the audit trail could not be written.';

  @override
  String get sessionClosedShutdown => 'Ended because the backend stopped.';

  @override
  String get permissionPageTitle => 'Permission';

  @override
  String get permissionQueueTitle => 'Waiting for you';

  @override
  String get permissionQueueDescription =>
      'Claude has stopped and will not run these until you answer. Silence refuses.';

  @override
  String permissionCardLabel(String tool) {
    return 'Permission for $tool';
  }

  @override
  String get permissionToolBash => 'Run a shell command';

  @override
  String get permissionToolWrite => 'Write a file';

  @override
  String get permissionToolEdit => 'Edit a file';

  @override
  String get permissionToolMultiEdit => 'Edit several files';

  @override
  String get permissionToolNotebookEdit => 'Edit a notebook';

  @override
  String get permissionToolRead => 'Read a file';

  @override
  String get permissionToolWebFetch => 'Fetch a page';

  @override
  String permissionToolUnknown(String tool) {
    return 'Use $tool';
  }

  @override
  String get permissionRiskRead => 'Reads something';

  @override
  String get permissionRiskWrite => 'Changes a file';

  @override
  String get permissionRiskDestructive => 'Could destroy something';

  @override
  String get permissionCommandLabel => 'Exactly what will run';

  @override
  String permissionRemaining(int seconds) {
    return '$seconds s left — then it is refused';
  }

  @override
  String get permissionScopeOnce => 'Allow once';

  @override
  String get permissionScopeOnceHint => 'Only this command, only now.';

  @override
  String get permissionScopeSession => 'Allow for this session';

  @override
  String get permissionScopeSessionHint => 'Every identical request, until this session ends.';

  @override
  String get permissionDeny => 'Refuse';

  @override
  String get permissionExtend => 'Give me more time';

  @override
  String get permissionExtendExhausted => 'This request cannot be extended again.';

  @override
  String get permissionSending => 'Sending your answer…';

  @override
  String get permissionConfirmTitle => 'This could destroy something. Allow it anyway?';

  @override
  String get permissionConfirmAction => 'Yes, allow it';

  @override
  String get permissionConfirmCancel => 'Go back';

  @override
  String get permissionLockReason => 'Confirm it is you to allow this command on your computer';

  @override
  String get permissionLockRefused =>
      'It was not confirmed that this is your phone. Nothing was sent.';

  @override
  String get permissionNoLockTitle => 'This phone has no screen lock';

  @override
  String get permissionNoLockBody =>
      'A phone without a fingerprint, PIN, pattern or password cannot approve commands. Set a screen lock in the system settings. You can still refuse and watch.';

  @override
  String get permissionNotSent =>
      'Your answer did not leave: the connection is down. Try again when it is back.';

  @override
  String get permissionOffline => 'No connection: answering waits for it to come back.';

  @override
  String get permissionConnecting => 'Connecting to the session before you can answer…';

  @override
  String get permissionDeviceBlocked =>
      'This phone cannot answer until it is approved in the browser.';

  @override
  String get permissionCheckingTitle => 'Checking this request with the server…';

  @override
  String get permissionGoneTitle => 'This request no longer exists';

  @override
  String get permissionGoneBody =>
      'The session it belonged to has ended, or the server restarted. There is nothing left to answer.';

  @override
  String get permissionOpenSession => 'Open the session';

  @override
  String get permissionOutcomeAllowedWeb => 'Allowed in the browser.';

  @override
  String get permissionOutcomeRefusedWeb => 'Refused in the browser.';

  @override
  String get permissionOutcomeAllowedPhone => 'Allowed from a phone.';

  @override
  String get permissionOutcomeRefusedPhone => 'Refused from a phone.';

  @override
  String get permissionOutcomeAllowed => 'Allowed.';

  @override
  String get permissionOutcomeRefused => 'Refused.';

  @override
  String get permissionOutcomeAllowedByRule =>
      'Allowed by one of your rules, without asking anybody.';

  @override
  String get permissionOutcomeRefusedByRule =>
      'Refused by one of your rules, without asking anybody.';

  @override
  String get permissionOutcomeExpired => 'Refused automatically: nobody answered in time.';

  @override
  String get approvalLockTitle => 'Ask for fingerprint or PIN before approving';

  @override
  String get approvalLockBody => 'On by default. Refusing never asks.';

  @override
  String get permissionErrorRequestNotFound => 'That request is no longer open.';

  @override
  String get permissionErrorRequestExpired => 'That request ran out of time.';

  @override
  String get permissionErrorNotOwned => 'That request is not yours to answer.';

  @override
  String get permissionScopeProject => 'Don\'t ask again in this project';

  @override
  String permissionScopeProjectHint(String duration) {
    return 'Matching requests in this project run without asking, for $duration.';
  }

  @override
  String get permissionScopeAlways => 'Don\'t ask again anywhere';

  @override
  String permissionScopeAlwaysHint(String duration) {
    return 'Matching requests in any of your projects run without asking, for $duration.';
  }

  @override
  String permissionRuleDays(int days) {
    return '$days days';
  }

  @override
  String permissionRuleHours(int hours) {
    return '$hours hours';
  }

  @override
  String get permissionPersistTitle => 'Stop asking about this?';

  @override
  String permissionPersistProject(String duration) {
    return 'Claude will run what matches the rule below in this project without asking you, for $duration.';
  }

  @override
  String permissionPersistAlways(String duration) {
    return 'Claude will run what matches the rule below in any of your projects without asking you, for $duration.';
  }

  @override
  String get permissionPersistRevocable =>
      'You can take it back at any time from your rules. Revoking takes effect on the next request, in every open session.';

  @override
  String get permissionPersistOpenRules => 'See your rules';

  @override
  String get permissionPersistConfirm => 'Allow and stop asking';

  @override
  String get permissionErrorRuleNotFound => 'That rule does not exist.';

  @override
  String get rulesTitle => 'Your rules';

  @override
  String get rulesOpen => 'Rules you granted';

  @override
  String get rulesReload => 'Read the list again';

  @override
  String get rulesDescription =>
      'What Claude may do on this machine without asking you first. Revoking takes effect on the next request, in every open session.';

  @override
  String get rulesLoading => 'Loading your rules…';

  @override
  String get rulesEmptyTitle => 'No rules yet';

  @override
  String get rulesEmptyBody =>
      'A rule is created when you answer a request with “don\'t ask again”. Until then, Claude asks you every time.';

  @override
  String get rulesScopeProject => 'In one project';

  @override
  String get rulesScopeAlways => 'In every project';

  @override
  String get rulesDecisionAllow => 'runs without asking';

  @override
  String get rulesDecisionDeny => 'refused without asking';

  @override
  String get rulesStatusActive => 'Active';

  @override
  String get rulesStatusExpired => 'Expired';

  @override
  String get rulesStatusUnknown => 'Unknown state';

  @override
  String rulesRowLabel(String pattern) {
    return 'Rule $pattern';
  }

  @override
  String rulesToolDecision(String tool, String decision) {
    return '$tool · $decision';
  }

  @override
  String rulesProject(String path) {
    return 'Project: $path';
  }

  @override
  String rulesGranted(String who, String at) {
    return 'Granted by $who on $at';
  }

  @override
  String rulesValidUntil(String at) {
    return 'Valid until $at';
  }

  @override
  String rulesExpiredOn(String at) {
    return 'Expired on $at. Claude asks you again.';
  }

  @override
  String rulesExpiringSoon(String at) {
    return 'Expires soon: after $at, Claude will ask you again.';
  }

  @override
  String get rulesRevoke => 'Revoke';

  @override
  String get rulesRevoking => 'Revoking…';
}
