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
  String get connectionStatusThrottled => 'Sent too fast — waiting as long as the server asked';

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
  String get workspaceListLoading => 'Loading folders';

  @override
  String get workspaceListEmptyTitle => 'No folders yet';

  @override
  String get workspaceListEmptyBody =>
      'Nothing is on the allowlist. It is set on the machine running the backend, not from here.';

  @override
  String get sessionTitle => 'Session';

  @override
  String get sessionEmptyTitle => 'Nothing yet';

  @override
  String get sessionEmptyBody => 'Send a prompt to start.';

  @override
  String get sessionPromptAction => 'Send';

  @override
  String get sessionPromptRefused => 'Not sent: this device is not connected.';

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
  String get sessionClosedIdleTimeout =>
      'Ended after sitting idle too long. Resume it from the history.';

  @override
  String get permissionPageTitle => 'Permission';

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

  @override
  String workspaceErrorNotAllowed(String path) {
    return 'This installation does not allow $path.';
  }

  @override
  String get workspaceErrorForbidden => 'That folder is not yours to open.';

  @override
  String sessionErrorLimitReached(String limit) {
    return 'This machine is already running $limit sessions, which is as many as it allows. End one and try again.';
  }

  @override
  String get sessionErrorClaudeUnavailable => 'Claude stopped responding on this machine.';

  @override
  String get transcriptErrorNotFound =>
      'That conversation does not exist, or it is not yours to read.';

  @override
  String transcriptErrorInvalidSessionId(String sessionId) {
    return '$sessionId is not a conversation identifier.';
  }

  @override
  String get transcriptErrorClaudeUnavailable =>
      'Claude could not read its history on this machine.';

  @override
  String get transcriptErrorClaudeTimeout => 'Claude took too long to read its history. Try again.';

  @override
  String get transcriptErrorCursorStale =>
      'This conversation changed while you were reading it. Reload it from the latest messages.';

  @override
  String get historyListTitle => 'History';

  @override
  String get historyListLoading => 'Loading conversations';

  @override
  String get historyListEmptyTitle => 'No conversations in this folder';

  @override
  String get historyListEmptyBody =>
      'Nothing has been said here yet — from this app, the editor or the terminal. Open a session on this folder from the folder list to start one.';

  @override
  String get historyOriginOurs => 'Opened from this app';

  @override
  String get historyOriginExternal => 'Began outside this app';

  @override
  String historyLastActive(String at) {
    return 'Last active $at';
  }

  @override
  String historyBranch(String branch) {
    return 'Branch $branch';
  }

  @override
  String get historyUntitled => 'Untitled conversation';

  @override
  String get historyLoadMore => 'Load more';

  @override
  String get historyLoadingMore => 'Loading…';

  @override
  String get historyConversationTitle => 'Conversation';

  @override
  String get historyConversationLoading => 'Loading the conversation';

  @override
  String get historyConversationEmptyTitle => 'Nothing said in this conversation';

  @override
  String get historyConversationEmptyBody =>
      'It has no messages to show. Resume it to say something.';

  @override
  String get historyLoadEarlier => 'Load earlier messages';

  @override
  String get historyResumeAction => 'Resume';

  @override
  String get historyResumePending => 'Resuming…';

  @override
  String get historyResumeOffline =>
      'Resuming needs the connection to the backend, and this device is not connected.';

  @override
  String get historyResumeNotSent =>
      'The conversation was not resumed: this device is not connected.';

  @override
  String get historyExternalNote =>
      'This conversation began outside this app. Resuming it here continues it under a new id: the editor or terminal it came from will not see the answers given here.';

  @override
  String get sessionHistoryLoading => 'Loading what was said before';

  @override
  String sessionErrorUnknownCommand(String command) {
    return '$command is not a command Claude offers on this machine.';
  }

  @override
  String get sessionErrorClaudeTimeout =>
      'Claude took too long to answer on this machine. Try again.';

  @override
  String get sessionErrorResumeTimeout =>
      'The backend did not answer the resume. Check the connection and try again.';

  @override
  String get sessionErrorLocked =>
      'The session is busy: a turn is running or another undo is in progress. Try again once it is idle.';

  @override
  String get sessionErrorRewindTargetUnknown => 'That undo point does not belong to this session.';

  @override
  String sessionErrorRewindIncomplete(String failed) {
    return 'Some files could not be put back ($failed). Each of them was left exactly as it was.';
  }

  @override
  String get sessionCommandsTitle => 'Commands';

  @override
  String get sessionCommandsDescription =>
      'What Claude offers on this machine. The prompt box accepts any command, listed here or not.';

  @override
  String get sessionCommandsSearch => 'Search commands';

  @override
  String get sessionCommandsSuggested => 'Suggested';

  @override
  String get sessionCommandsAll => 'All commands';

  @override
  String get sessionCommandsLoading => 'Loading commands';

  @override
  String get sessionCommandsEmptyTitle => 'No commands on this machine';

  @override
  String get sessionCommandsEmptyBody =>
      'Claude here offers no commands. You can still type anything in the prompt box.';

  @override
  String sessionCommandsNoMatch(String query) {
    return 'No command matches “$query”.';
  }

  @override
  String get sessionUndoTitle => 'Undo file changes';

  @override
  String get sessionUndoDescription =>
      'Put the files this session wrote back to how they were before one of its turns. A file changed outside the session stays as it is.';

  @override
  String get sessionUndoLoading => 'Loading undo points';

  @override
  String get sessionUndoEmptyTitle => 'Nothing to undo yet';

  @override
  String get sessionUndoEmptyBody =>
      'Every turn that writes files becomes a point this session can go back to.';

  @override
  String get sessionUndoUntitled => 'Untitled turn';

  @override
  String sessionUndoPointAt(String date, String time) {
    return '$date at $time';
  }

  @override
  String sessionUndoFileCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count files',
      one: '1 file',
      zero: 'No files',
    );
    return '$_temp0';
  }

  @override
  String sessionUndoConfirmTitle(String label) {
    return 'Go back to before “$label”';
  }

  @override
  String get sessionUndoGoesBack => 'Goes back';

  @override
  String get sessionUndoStays => 'Stays as it is';

  @override
  String get sessionUndoAlready => 'Already as it was';

  @override
  String get sessionUndoRestore => 'Its content before the turn is put back';

  @override
  String get sessionUndoDelete => 'Deleted: this turn created it';

  @override
  String get sessionUndoReasonModifiedOutside => 'Changed outside the session after it wrote it';

  @override
  String get sessionUndoReasonNotRestorable => 'Too large or unreadable to have been saved';

  @override
  String get sessionUndoReasonUnsafePath =>
      'No longer a regular file, or its folder no longer resolves';

  @override
  String get sessionUndoReasonNoBaseline => 'Nothing records how the session left it';

  @override
  String get sessionUndoReasonOther => 'Kept for a reason this app does not know';

  @override
  String get sessionUndoNothingToRevert =>
      'Nothing would change: no file of this point can go back.';

  @override
  String get sessionUndoConfirm => 'Undo';

  @override
  String get sessionUndoPending => 'Undoing…';

  @override
  String get sessionUndoBack => 'Back to the undo points';

  @override
  String get sessionUndoBusy =>
      'Undo is available only while the session is idle. Wait for the turn to finish.';

  @override
  String get sessionUndoClosed =>
      'This session is closed, so its files can no longer be undone from here.';

  @override
  String get sessionUndoOffline =>
      'Undoing needs the connection to the backend, and this device is not connected.';

  @override
  String get sessionUndoNotSent => 'Nothing was undone: this device is not connected.';

  @override
  String get sessionUndoDoneTitle => 'The undo is done';

  @override
  String get sessionUndoReverted => 'Put back';

  @override
  String get sessionUndoRestored => 'Restored to how it was before the turn';

  @override
  String get sessionUndoDeleted => 'Deleted: the turn had created it';

  @override
  String get sessionUndoFailed => 'Could not be put back';

  @override
  String get diagnosticsTitle => 'Diagnostics';

  @override
  String get diagnosticsConnectionLabel => 'Connection';

  @override
  String get diagnosticsCredentialLabel => 'Sign-in';

  @override
  String get diagnosticsCredentialPresent => 'Signed in';

  @override
  String get diagnosticsCredentialAbsent => 'Not signed in';

  @override
  String get diagnosticsVersionLabel => 'Version';

  @override
  String get diagnosticsDebugLabel => 'Detailed logging';

  @override
  String get diagnosticsDebugDescription =>
      'Records every exchange with the server while this screen is open. It switches itself off when you leave.';

  @override
  String get diagnosticsDebugAlwaysOn => 'Always on in a development build.';

  @override
  String get sessionEndedResumes =>
      'Sending a prompt resumes it, in a new process of Claude on this machine.';

  @override
  String get sessionEndedResumeAndSend => 'Resume and send';

  @override
  String get sessionEndedResuming => 'Resuming the conversation…';

  @override
  String get commonActionShowAll => 'Show all of it';

  @override
  String sessionTurnLine(String costUsd, String seconds) {
    return 'Turn ended: $costUsd USD · $seconds s';
  }

  @override
  String get sessionCompactedManual => 'Compacted on request: what came before is a summary now';

  @override
  String get sessionCompactedAuto =>
      'Compacted on its own, the context was full: what came before is a summary now';

  @override
  String sessionCompactedManualTokens(String tokens) {
    return 'Compacted on request: $tokens tokens before are a summary now';
  }

  @override
  String sessionCompactedAutoTokens(String tokens) {
    return 'Compacted on its own, the context was full: $tokens tokens before are a summary now';
  }

  @override
  String get thinkingLive => 'Thinking…';

  @override
  String get thinkingDone => 'Thought';

  @override
  String thinkingTook(String seconds) {
    return 'Thought for $seconds s';
  }

  @override
  String get thinkingHidden => 'Thought — the model did not show it';

  @override
  String get thinkingNothingShown => 'The model thought here and did not show what it thought.';

  @override
  String get draftTitle => 'A new conversation';

  @override
  String get draftDescription =>
      'Nothing runs until you send the first prompt: then a session of Claude opens in this folder, with what you chose below.';

  @override
  String get draftCommands => 'Type / for the commands and skills of this installation.';

  @override
  String get draftDefaultModel =>
      'The models of this installation appear once a session of this folder has run; until then, the installation\'s default is used.';

  @override
  String get draftStarting => 'Opening the session…';

  @override
  String draftCatalogFailed(String reason) {
    return 'The choices of this installation could not be read, so the conversation starts with its defaults: $reason';
  }

  @override
  String get composerBoxLabel => 'Prompt';

  @override
  String get composerPlaceholder => 'Ask Claude to do something in this folder…';

  @override
  String get composerQueue => 'Add to queue';

  @override
  String get composerQueued =>
      'Claude is working: what you send now waits in the queue and runs next.';

  @override
  String get composerStop => 'Stop';

  @override
  String get composerEmpty => 'Write a prompt to send.';

  @override
  String get composerSlash => 'Commands and skills (/)';

  @override
  String get composerMore => 'More choices: the model, the effort and the context';

  @override
  String get composerRefusalClose => 'Close this message';

  @override
  String composerBlocked(String reason) {
    return 'Nothing can be sent right now: $reason';
  }

  @override
  String composerChoice(String label, String value) {
    return '$label: $value';
  }

  @override
  String get composerChoicePending => 'Changing…';

  @override
  String get modeLabel => 'Mode';

  @override
  String get modeDefault => 'Ask me';

  @override
  String get modeDefaultDescription => 'Claude asks before every tool that needs your word.';

  @override
  String get modeAcceptEdits => 'Accept edits';

  @override
  String get modeAcceptEditsDescription =>
      'Claude edits and writes files without asking; it still asks before anything else.';

  @override
  String get modeAcceptEditsWarning =>
      'Claude will edit and write files without asking you — and without the preview of the change.';

  @override
  String get modePlan => 'Plan';

  @override
  String get modePlanDescription =>
      'Claude plans without changing anything, and asks you to approve the plan.';

  @override
  String get modelLabel => 'Model';

  @override
  String get modelDefault => 'Installation default';

  @override
  String modelsFailed(String reason) {
    return 'The models of this installation could not be read: $reason';
  }

  @override
  String get modelsLoading => 'Loading the models';

  @override
  String get effortLabel => 'Effort';

  @override
  String get effortDefault => 'Default effort';

  @override
  String get effortLow => 'Low';

  @override
  String get effortMedium => 'Medium';

  @override
  String get effortHigh => 'High';

  @override
  String get effortXhigh => 'Extra high';

  @override
  String get effortMax => 'Maximum';

  @override
  String get effortReadOnly =>
      'The effort is chosen when a conversation starts. Changing it in a running one would stop Claude from asking before each tool.';

  @override
  String get effortUnknown => 'As it started';

  @override
  String get queueTitle => 'Waiting prompts';

  @override
  String get queueDescription =>
      'These run one after the other, as their own turns, when the turn running ends.';

  @override
  String queueCancel(String position) {
    return 'Take prompt $position out of the queue';
  }

  @override
  String queuePosition(String position) {
    return '#$position';
  }

  @override
  String get queueFromWeb => 'from a browser';

  @override
  String get queueFromMobile => 'from the phone';

  @override
  String get queueFromOther => 'from another client';

  @override
  String contextLabel(String percentage) {
    return 'Context window $percentage% used';
  }

  @override
  String contextPercentage(String percentage) {
    return '$percentage%';
  }

  @override
  String contextWindow(String total, String max) {
    return '$total of $max tokens';
  }

  @override
  String contextTokens(String tokens) {
    return '$tokens tokens';
  }

  @override
  String get contextNear =>
      'The conversation is near the limit of its context. Compacting it keeps it going.';

  @override
  String get contextCompact => 'Compact the conversation (/compact)';

  @override
  String get contextCompacting => 'Compacting…';

  @override
  String get contextUnavailable => 'The use of the context could not be read.';

  @override
  String get contextLoading => 'Reading the context';

  @override
  String get contextSystemPrompt => 'System prompt';

  @override
  String get contextSystemTools => 'System tools';

  @override
  String get contextMcpTools => 'MCP tools';

  @override
  String get contextMessages => 'Messages';

  @override
  String get contextMemoryFiles => 'Memory files';

  @override
  String get contextSkills => 'Skills';

  @override
  String get contextFreeSpace => 'Free space';

  @override
  String get contextBuffer => 'Reserved for compaction';

  @override
  String get sessionErrorQueuedPromptStarted =>
      'That prompt has already started. Interrupt the turn to stop it.';

  @override
  String get sessionErrorQueuedPromptNotFound => 'That prompt is no longer in the queue.';

  @override
  String sessionErrorEffortUnsupported(String model, String level) {
    return '$model does not take the effort level $level.';
  }

  @override
  String get sessionStandingConnected => 'Connected';

  @override
  String get sessionStandingReconnecting => 'Reconnecting';

  @override
  String get sessionStandingRunning => 'Running';

  @override
  String get sessionStandingWaiting => 'Waiting for you';

  @override
  String get sessionStandingEnded => 'Ended';

  @override
  String sessionStandingOpen(String standing) {
    return 'Status: $standing. Open the details of the session';
  }

  @override
  String get sessionDotConnected => 'Connected — nothing running';

  @override
  String get sessionDotReconnecting => 'Reconnecting…';

  @override
  String get sessionDotRunning => 'Claude is working';

  @override
  String get sessionDotWaiting => 'Claude is waiting for your answer';

  @override
  String get sessionDotEnded => 'The session ended';

  @override
  String sessionDotSession(String sessionId) {
    return 'Session $sessionId';
  }

  @override
  String get sessionStatusTitle => 'The session';

  @override
  String get sessionStatusDescription =>
      'How it stands, which session it is, and what it has cost since it opened.';

  @override
  String sessionStatusCost(String cost, String turns) {
    return 'This session has cost $cost since it opened, over $turns turn(s)';
  }

  @override
  String get sessionStatusNoCost => 'No turn has ended yet, so there is no cost to say.';

  @override
  String get sessionMenuOpen => 'More actions of the session';

  @override
  String get sessionMenuRules => 'Permission rules';

  @override
  String get sessionMenuUndo => 'Undo file changes…';

  @override
  String get sessionMenuCopyId => 'Copy the session id';

  @override
  String get sessionMenuCopied => 'The session id was copied.';

  @override
  String sessionMenuCopyFailed(String sessionId) {
    return 'The id could not be copied. Select it and copy it by hand: $sessionId';
  }

  @override
  String get sessionMenuHelp => 'Help about this screen';

  @override
  String get sessionMenuEnd => 'End session';

  @override
  String get sessionMenuEndNotOwner => 'Only the app that opened this session can end it.';

  @override
  String get sessionMenuEndEnded => 'The session has already ended.';

  @override
  String get sessionCloseTitle => 'End this session?';

  @override
  String get sessionCloseDescription =>
      'Claude stops on this machine. What it wrote stays on disk, but the undo of its file changes goes with the session. The conversation stays in the history, and can be resumed.';

  @override
  String get sessionCloseKeep => 'Keep it running';

  @override
  String get sessionCloseConfirm => 'End the session';

  @override
  String get sessionHistoryOpen => 'Conversations of this folder';

  @override
  String get sessionHistoryUnknown => 'The folder of this session is not known yet';

  @override
  String get sessionHelpTitle => 'The session screen';

  @override
  String get sessionHelpIntro =>
      'Only the conversation scrolls. The box stays at the bottom, over the keyboard, with what holds for the next prompt under it; what the session is doing is said in the conversation itself, in the order it happened.';

  @override
  String get sessionHelpBarHeading => 'The bar under the box';

  @override
  String get sessionHelpBar =>
      'In this order: / lists the commands and skills; then the mode, the model, the effort and the share of the context window used — with Compact inside it — and send. While Claude works, send puts what you wrote in the queue, and Stop stands beside it; with the box empty, the button itself is Stop. The effort is chosen in a new conversation only. On a narrow screen, the model, the effort and the context move into the … of the bar.';

  @override
  String get sessionHelpMenuHeading => 'The menu of the session';

  @override
  String get sessionHelpMenu =>
      'The … of the top bar holds what is done to the whole session, and seldom: end it — only the app that opened it may, and it asks first —, undo its file changes, copy its id; and the permission rules and this help. The clock beside it opens the conversations of this folder.';

  @override
  String get sessionHelpStatusHeading => 'The status';

  @override
  String get sessionHelpStatus =>
      'The chip of the top bar says how the session stands, by colour and by word: connected, reconnecting, running, waiting for you, or ended. Tap it for the id of the session, with the way to copy it, and what it has cost since it opened.';

  @override
  String get sessionHelpWorkingHeading => 'While Claude works';

  @override
  String get sessionHelpWorking =>
      'While a turn runs, its last line moves: an asterisk, what Claude is doing — the tool it runs, that it waits for you, or a word for the turn — and for how long. Its thinking is a line of its own, in order: \"Thinking…\" while it arrives, \"Thought for n s\" once it is over, folded — tap it to read it. When the turn ends, the line gives way to what the turn cost.';

  @override
  String get sessionHelpInlineHeading => 'Questions in the conversation';

  @override
  String get sessionHelpInline =>
      'When Claude asks before running a tool, the question is in the conversation, in the place of that tool: the exact command, how risky it is, the time left and how far a yes reaches. Once answered, the tool line says how — by you, in the browser, by one of your rules, or refused because nobody answered in time. A question never closes the keyboard nor takes the box from you: send still sends your prompt, and only a tap on the card answers it.';

  @override
  String get sessionHelpPillHeading => 'Waiting for your answer';

  @override
  String get sessionHelpPill =>
      'With a question out of view — the conversation scrolled up — a pill over the box says Claude is waiting, and how many questions. Tapping it takes you to the oldest.';

  @override
  String get sessionHelpTasksHeading => 'The task list';

  @override
  String get sessionHelpTasks =>
      'When Claude keeps a task list, it stands over the box, folded into one line — how many are done and what is being done now. Tap it for the whole list; it changes as Claude works, without moving what you are reading.';

  @override
  String get sessionHelpActionsHeading => 'From a prompt';

  @override
  String get sessionHelpActions =>
      'Press and hold a prompt of yours for what can be done from it: edit it and send it again, fork from before it, and put the files back to before its turn — with the reach shown file by file first. A screen reader offers the same three as actions of the message. While Claude works the undo waits for the turn to end; once the session has ended there is no undo.';

  @override
  String get permissionPlanLabel => 'The plan Claude proposes';

  @override
  String get permissionPlanTitle => 'Approve the plan?';

  @override
  String get permissionPlanModeLegend => 'Once approved, go on';

  @override
  String get permissionPlanApprove => 'Approve the plan';

  @override
  String get permissionPlanCommentLabel => 'Or say what to change, and keep planning';

  @override
  String get permissionPlanKeepPlanning => 'Keep planning';

  @override
  String get permissionPlanModeDefault => 'asking before each edit';

  @override
  String get permissionPlanModeAcceptEdits => 'accepting edits without asking';

  @override
  String get sessionWorkingWaiting => 'Waiting for your answer';

  @override
  String sessionWorkingRunningTool(String tool) {
    return 'Running $tool…';
  }

  @override
  String sessionWorkingSeconds(String seconds) {
    return '$seconds s';
  }

  @override
  String sessionWorkingMinutes(String minutes, String seconds) {
    return '$minutes min $seconds s';
  }

  @override
  String get sessionWorkingVerbPondering => 'Pondering…';

  @override
  String get sessionWorkingVerbDeciphering => 'Deciphering…';

  @override
  String get sessionWorkingVerbMulling => 'Mulling it over…';

  @override
  String get sessionWorkingVerbReasoning => 'Reasoning…';

  @override
  String get sessionWorkingVerbWeighing => 'Weighing the options…';

  @override
  String get sessionWorkingVerbSketching => 'Sketching…';

  @override
  String get sessionWorkingVerbUntangling => 'Untangling…';

  @override
  String get sessionWorkingVerbAssembling => 'Assembling…';

  @override
  String get sessionWorkingVerbTinkering => 'Tinkering…';

  @override
  String get sessionWorkingVerbExploring => 'Exploring…';

  @override
  String get sessionWorkingVerbConnecting => 'Connecting the dots…';

  @override
  String get sessionWorkingVerbDistilling => 'Distilling…';

  @override
  String get sessionWorkingVerbBrewing => 'Brewing…';

  @override
  String get sessionWorkingVerbCrafting => 'Crafting…';

  @override
  String get sessionWorkingVerbInvestigating => 'Investigating…';

  @override
  String get sessionWorkingVerbPuzzling => 'Puzzling it out…';

  @override
  String get sessionWorkingVerbConsidering => 'Considering…';

  @override
  String get sessionWorkingVerbComputing => 'Computing…';

  @override
  String get sessionWorkingVerbWorking => 'Working…';

  @override
  String get sessionWorkingVerbMusing => 'Musing…';

  @override
  String sessionPendingPill(String count) {
    return 'Claude is waiting for your answer ($count)';
  }

  @override
  String get sessionInlineTail => 'Questions waiting for you';

  @override
  String get sessionTasksLabel => 'The task list Claude keeps for this conversation';

  @override
  String sessionTasksHeadline(String done, String total, String task) {
    return '$done/$total · $task';
  }

  @override
  String sessionTasksAllDone(String done, String total) {
    return '$done/$total · All done';
  }

  @override
  String get sessionTaskPending => 'Pending';

  @override
  String get sessionTaskInProgress => 'In progress';

  @override
  String get sessionTaskCompleted => 'Completed';

  @override
  String sessionRewoundSummary(String restored, String kept) {
    return 'Files put back: $restored back, $kept kept as they were';
  }

  @override
  String sessionRewoundFailed(String restored, String kept, String failed) {
    return 'Files put back: $restored back, $kept kept as they were, $failed could not go back';
  }

  @override
  String get sessionReplayPartial =>
      'This is only what the server still had in memory, not the whole conversation.';

  @override
  String get sessionMessageActions => 'What to do with this prompt';

  @override
  String get sessionMessageEdit => 'Edit and send again';

  @override
  String get sessionMessageForkFrom =>
      'Fork from here — send it again, unchanged, in a new conversation';

  @override
  String get sessionMessageUndo => 'Put the files back to before this prompt';

  @override
  String get sessionMessageUndoBusy =>
      'Put the files back to before this prompt — not while Claude is working';

  @override
  String get sessionMessageHold => 'Press and hold for what to do with this prompt';

  @override
  String get sessionEditEditing => 'Editing a message';

  @override
  String get sessionEditCancel => 'Stop editing';

  @override
  String get sessionEditExplain =>
      'You are editing a prompt: sending it starts a new conversation from before it. The original conversation stays as it was.';

  @override
  String get sessionEditResumeInstead => 'Resume the conversation instead';

  @override
  String get sessionForkStarting => 'Opening the new conversation…';

  @override
  String get sessionErrorForkRejected =>
      'Claude could not continue the conversation from that message. Resume the conversation instead, and edit from there.';

  @override
  String get sessionErrorForkPointUnknown =>
      'That message is not a prompt of this conversation. Reload the conversation and try again.';

  @override
  String get connectionTitle => 'Server address';

  @override
  String get connectionDescription =>
      'Choose how this phone reaches your server: the address on your network, the one on the internet, or another one. The API, the live connection and the login all go through it.';

  @override
  String get connectionInternal => 'Internal';

  @override
  String get connectionInternalHint => 'On your local network';

  @override
  String get connectionExternal => 'External';

  @override
  String get connectionExternalHint => 'Over the internet';

  @override
  String get connectionOther => 'Other';

  @override
  String get connectionOtherLabel => 'Address of the server';

  @override
  String get connectionOtherHint => 'https://my-server.example';

  @override
  String get connectionUndefined => 'This version of the app was built without this address.';

  @override
  String connectionInUse(String origin) {
    return 'In use: $origin';
  }

  @override
  String get connectionNone =>
      'There is no address to reach the server through yet: choose one to sign in.';

  @override
  String get connectionNoticeUnavailable =>
      'The address saved before is not offered by this version of the app, so the default is in use.';

  @override
  String get connectionTest => 'Test the connection';

  @override
  String get connectionTesting => 'Testing…';

  @override
  String connectionResultOk(String origin) {
    return 'The server and its login answered at $origin.';
  }

  @override
  String connectionResultServerUnreachable(String origin) {
    return 'Nothing answered at $origin: the server is down, not reachable from this network, or this is not its address.';
  }

  @override
  String connectionResultLoginUnavailable(String origin) {
    return 'The server answered at $origin, but its login did not.';
  }

  @override
  String get connectionSave => 'Save';

  @override
  String get connectionSwitchTitle => 'Change the address?';

  @override
  String get connectionSwitchBody =>
      'Changing the address ends your login: the next one is with the server at the new address.';

  @override
  String get connectionSwitchConfirm => 'Change and sign out';

  @override
  String get connectionSwitchCancel => 'Keep this address';

  @override
  String get connectionProblemEmpty => 'Write the address of the server.';

  @override
  String get connectionProblemNotAnAddress => 'This is not an address: start it with https://';

  @override
  String get connectionProblemScheme => 'Only https:// addresses are accepted.';

  @override
  String get connectionProblemPlainText =>
      'Only https:// is accepted here: http:// is for this phone itself (localhost) and, in the development app, for an IP of the local network (10.x, 172.16–31.x, 192.168.x), because the login would travel in clear text.';

  @override
  String get connectionProblemPath => 'Only the address of the server: nothing after the /.';

  @override
  String get connectionProblemQuery => 'Only the address of the server: no ? after it.';

  @override
  String get connectionProblemFragment => 'Only the address of the server: no # after it.';

  @override
  String get connectionProblemUserInfo => 'The address must not carry a user or a password.';

  @override
  String get connectionHelpOpen => 'Help about the server address';

  @override
  String get connectionHelpBody =>
      'The app reaches your server through one address, and everything goes through it: the API, the live connection and the login. Internal is the address on your network; external is the one on the internet, when your server is exposed; other is any address you type. Only https:// is accepted, except for localhost. Test the connection before saving: it asks the server and its login, and says which one did not answer. Your choice stays on this phone through restarts and sign-outs. Changing it ends your login, because the next one is with the server at the new address. This screen opens without signing in, from the sign-in screen, so a wrong address never locks you out.';

  @override
  String get foldersTitle => 'Folders';

  @override
  String get foldersOpenSection => 'Open';

  @override
  String get foldersRecentSection => 'Recent';

  @override
  String get foldersOpenAnother => 'Open another folder';

  @override
  String get foldersNoneOpenTitle => 'No folder open';

  @override
  String get foldersNoneOpenBody =>
      'Open a folder to start a session in it. The folders open here are the same as the tabs in the browser.';

  @override
  String get foldersNoRecent => 'No other folder opened before.';

  @override
  String get foldersLoading => 'Reading your folders…';

  @override
  String get foldersMissing => 'This folder is no longer on the computer.';

  @override
  String get foldersNotAllowed => 'This folder is no longer inside a root you may use.';

  @override
  String foldersSessions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count sessions open',
      one: '1 session open',
      zero: 'No session open',
    );
    return '$_temp0';
  }

  @override
  String foldersPending(int count) {
    return '$count waiting for you';
  }

  @override
  String get foldersLoadFailed => 'The sessions of this folder could not be read.';

  @override
  String foldersActions(String name) {
    return 'Actions for $name';
  }

  @override
  String get foldersClose => 'Close folder';

  @override
  String get foldersClosed => 'Folder closed. No session was ended.';

  @override
  String get foldersPin => 'Pin';

  @override
  String get foldersUnpin => 'Unpin';

  @override
  String get foldersForget => 'Remove from recent';

  @override
  String foldersLimitReached(String limit) {
    return 'You already have $limit folders open. Close one to open another.';
  }

  @override
  String get foldersHelpOpen => 'Help about folders';

  @override
  String get foldersHelpBody =>
      'Open: the folders you are working in — the same as the folder tabs in the browser. Each one says how many sessions are open in it and how many questions wait for you. Tap one to see its sessions and its history, or to start a new session.\n\nRecent: folders you opened before. Tap one to open it again; pin the ones you come back to.\n\nOpen another folder: walk the roots this computer lets Claude run in, one level at a time, and open the folder you want.\n\nClosing a folder only takes it off the list: the sessions in it keep running.';

  @override
  String get folderPickerTitle => 'Open a folder';

  @override
  String get folderPickerRoots => 'The roots this computer lets Claude run in';

  @override
  String get folderPickerOpenThis => 'Open this folder';

  @override
  String get folderPickerUp => 'Up one level';

  @override
  String get folderPickerEmpty => 'No subfolder here.';

  @override
  String get folderPickerTruncated =>
      'There are too many folders here: only the first ones are listed.';

  @override
  String get folderPickerLoading => 'Reading the folder…';

  @override
  String get folderNewSession => 'New session';

  @override
  String get folderOpenSessions => 'Open sessions';

  @override
  String get folderNoOpenSessions => 'No session open in this folder';

  @override
  String get folderNoOpenSessionsBody =>
      'Start one with New session, or open one from the history below.';

  @override
  String get folderSessionsLoading => 'Reading the open sessions…';

  @override
  String get folderHistory => 'History';

  @override
  String get folderHistorySeeAll => 'See all';

  @override
  String get folderHistoryEmpty => 'No conversation in this folder yet.';

  @override
  String folderSessionDetails(String status, String model) {
    return '$status · $model';
  }

  @override
  String folderSessionStarted(String when) {
    return 'Started $when';
  }

  @override
  String folderSessionBelow(String path) {
    return 'In $path';
  }

  @override
  String get folderOpenedFromWeb => 'Opened in a browser';

  @override
  String get folderOpenedFromMobile => 'Opened on a phone';

  @override
  String get folderHelpOpen => 'Help about this folder';

  @override
  String get folderHelpBody =>
      'New session: a draft in this folder. Nothing runs until you send the first prompt.\n\nOpen sessions: what runs in this folder and below it right now, opened here, on another phone or in a browser. Tap one to follow it; it joins the sessions panel of this folder.\n\nHistory: the conversations Claude kept for this folder. Open one to read it or to continue it.';

  @override
  String get liveStatusStarting => 'Starting';

  @override
  String get liveStatusIdle => 'Idle';

  @override
  String get liveStatusThinking => 'Thinking';

  @override
  String get liveStatusRunning => 'Running a tool';

  @override
  String get liveStatusWaiting => 'Waiting for you';

  @override
  String get liveStatusClosed => 'Ended';

  @override
  String get liveStatusUnknown => 'Unknown status';

  @override
  String get folderPanelOpen => 'Sessions of this folder';

  @override
  String folderPanelTitle(String folder) {
    return 'Sessions of $folder';
  }

  @override
  String get folderPanelAll => 'All sessions of the folder';

  @override
  String get folderPanelCurrent => 'On screen';

  @override
  String get folderPanelWaitingElsewhere => 'Another session of this folder is waiting for you';

  @override
  String get sessionCloseInApp => 'Close in the app';

  @override
  String get sessionCloseInAppNote =>
      'It keeps running; it only leaves this list. Open it again from the folder.';

  @override
  String get workspaceErrorNotFound => 'That folder is no longer there.';

  @override
  String get workspaceErrorNotADirectory => 'That is a file, not a folder.';

  @override
  String workspaceErrorDirectoryUnreadable(String path) {
    return 'This computer cannot read $path.';
  }

  @override
  String get folderNewSessionOffline => 'Waiting for the connection to start a session.';
}
