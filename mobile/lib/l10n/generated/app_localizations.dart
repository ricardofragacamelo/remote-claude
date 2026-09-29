import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_pt.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en'), Locale('pt')];

  /// Name of the application, shown in the task switcher
  ///
  /// In en, this message translates to:
  /// **'remote-claude'**
  String get appTitle;

  /// Recovery action offered by the error view
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get commonActionRetry;

  /// Ends the session on this device
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get commonActionSignOut;

  /// Failure with no better explanation to give
  ///
  /// In en, this message translates to:
  /// **'Something went wrong on our side.'**
  String get commonErrorUnexpected;

  /// The request never reached a server
  ///
  /// In en, this message translates to:
  /// **'The backend could not be reached.'**
  String get commonErrorOffline;

  /// The server rejected the payload
  ///
  /// In en, this message translates to:
  /// **'The request was not valid.'**
  String get commonErrorInvalidInput;

  /// The addressed resource is gone or never existed
  ///
  /// In en, this message translates to:
  /// **'That does not exist.'**
  String get commonErrorNotFound;

  /// Authenticated, but not authorised
  ///
  /// In en, this message translates to:
  /// **'You are not allowed to do that.'**
  String get commonErrorForbidden;

  /// The frame or body exceeded the limit
  ///
  /// In en, this message translates to:
  /// **'That is larger than the server accepts.'**
  String get commonErrorPayloadTooLarge;

  /// The caller was throttled
  ///
  /// In en, this message translates to:
  /// **'Too many requests. Try again in a moment.'**
  String get commonErrorRateLimited;

  /// Shown on the error view so a user report can be found in the logs
  ///
  /// In en, this message translates to:
  /// **'Trace {traceId}'**
  String commonErrorTraceLabel(String traceId);

  /// The credential is missing or rejected
  ///
  /// In en, this message translates to:
  /// **'Please sign in again.'**
  String get authErrorUnauthenticated;

  /// The access token is past its expiry
  ///
  /// In en, this message translates to:
  /// **'Your session expired.'**
  String get authErrorTokenExpired;

  /// The authorization response failed validation
  ///
  /// In en, this message translates to:
  /// **'The sign-in reply did not match the request.'**
  String get authErrorInvalidState;

  /// Heading of the sign-in screen
  ///
  /// In en, this message translates to:
  /// **'Sign in to continue'**
  String get authSignInTitle;

  /// Why the application asks for a sign-in
  ///
  /// In en, this message translates to:
  /// **'remote-claude runs Claude Code on your own machine, so it asks who you are first.'**
  String get authSignInDescription;

  /// Opens the provider in the system browser
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authSignInAction;

  /// Shown while the token exchange is in flight
  ///
  /// In en, this message translates to:
  /// **'Finishing sign-in…'**
  String get authSignInPending;

  /// The server closed the socket with 4426
  ///
  /// In en, this message translates to:
  /// **'This build speaks an older protocol. Update the app.'**
  String get connectionErrorUnsupportedVersion;

  /// Connection state: nothing has been opened yet
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get connectionStatusIdle;

  /// Connection state: the socket is opening
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get connectionStatusConnecting;

  /// Connection state: the handshake succeeded
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connectionStatusReady;

  /// Connection state: waiting out the backoff
  ///
  /// In en, this message translates to:
  /// **'Reconnecting…'**
  String get connectionStatusReconnecting;

  /// Connection state: the server closed the socket for sending too fast, and the app waits as long as it asked
  ///
  /// In en, this message translates to:
  /// **'Sent too fast — waiting as long as the server asked'**
  String get connectionStatusThrottled;

  /// Connection state: closed and not retrying
  ///
  /// In en, this message translates to:
  /// **'Disconnected'**
  String get connectionStatusClosed;

  /// Heading of the walking skeleton screen
  ///
  /// In en, this message translates to:
  /// **'Round trip'**
  String get sessionPingTitle;

  /// What the round trip proves
  ///
  /// In en, this message translates to:
  /// **'One command across every layer: the gateway, the use case, the rule, the database and back as an event.'**
  String get sessionPingDescription;

  /// Sends the diag.ping command
  ///
  /// In en, this message translates to:
  /// **'Send ping'**
  String get sessionPingAction;

  /// Shown while a ping is in flight
  ///
  /// In en, this message translates to:
  /// **'Waiting for the pong…'**
  String get sessionPingPending;

  /// Empty state of the round-trip list
  ///
  /// In en, this message translates to:
  /// **'No round trip yet. Send one to see the whole chain work.'**
  String get sessionPingEmpty;

  /// One received pong: how many times the session was pinged, and when
  ///
  /// In en, this message translates to:
  /// **'Pong {count} at {at}'**
  String sessionPingResult(int count, String at);

  /// The seq the hub assigned to the event
  ///
  /// In en, this message translates to:
  /// **'Sequence {seq}'**
  String sessionPingSequence(int seq);

  /// Identifier of the session on screen
  ///
  /// In en, this message translates to:
  /// **'Session {sessionId}'**
  String sessionPingSessionLabel(String sessionId);

  /// The server answered SESSION_NOT_FOUND
  ///
  /// In en, this message translates to:
  /// **'That session no longer exists.'**
  String get sessionErrorNotFound;

  /// The session id failed validation before any call
  ///
  /// In en, this message translates to:
  /// **'{sessionId} is not a session identifier.'**
  String sessionErrorInvalidSessionId(String sessionId);

  /// Title while the registration request is in flight
  ///
  /// In en, this message translates to:
  /// **'Registering this device'**
  String get deviceStatusRegisteringTitle;

  /// Body while the registration request is in flight
  ///
  /// In en, this message translates to:
  /// **'Telling the backend which device this is.'**
  String get deviceStatusRegisteringBody;

  /// Title of the banner shown while the device is pending
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval'**
  String get deviceStatusPendingTitle;

  /// Why the approval controls are disabled on a pending device
  ///
  /// In en, this message translates to:
  /// **'You can watch sessions from here. Approving a tool needs this device approved first, and that is done from the browser on your machine.'**
  String get deviceStatusPendingBody;

  /// Title of the banner shown when the device has been revoked
  ///
  /// In en, this message translates to:
  /// **'This device was revoked'**
  String get deviceStatusRevokedTitle;

  /// What to do about a revoked device
  ///
  /// In en, this message translates to:
  /// **'It can no longer answer permission requests. Approve it again from the browser on your machine, or sign out.'**
  String get deviceStatusRevokedBody;

  /// Title shown when the registration could not be completed or the status is unknown
  ///
  /// In en, this message translates to:
  /// **'This device is not registered'**
  String get deviceStatusUnknownTitle;

  /// What still works when the registration is unknown
  ///
  /// In en, this message translates to:
  /// **'You can watch sessions. Approving a tool is off until the registration goes through.'**
  String get deviceStatusUnknownBody;

  /// DEVICE_NOT_REGISTERED from the backend
  ///
  /// In en, this message translates to:
  /// **'This device is not approved yet.'**
  String get authErrorDeviceNotRegistered;

  /// DEVICE_REVOKED from the backend
  ///
  /// In en, this message translates to:
  /// **'This device has been revoked.'**
  String get authErrorDeviceRevoked;

  /// NOT_FOUND for a device id
  ///
  /// In en, this message translates to:
  /// **'That device does not exist.'**
  String get authErrorDeviceNotFound;

  /// FORBIDDEN when a device tries to approve one
  ///
  /// In en, this message translates to:
  /// **'A device cannot approve a device. Use the browser.'**
  String get authErrorDeviceApprovalForbidden;

  /// Title when the user refused the OS notification permission
  ///
  /// In en, this message translates to:
  /// **'Notifications are off'**
  String get pushDeniedTitle;

  /// Body when the user refused the OS notification permission
  ///
  /// In en, this message translates to:
  /// **'Without notifications, you will only see an approval request while this app is open. You can turn them on in the system settings.'**
  String get pushDeniedBody;

  /// Action that takes the user to the OS notification settings
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get pushDeniedAction;

  /// Title when this build has no push transport configured
  ///
  /// In en, this message translates to:
  /// **'Notifications are not available'**
  String get pushUnavailableTitle;

  /// Body when this build has no push transport configured
  ///
  /// In en, this message translates to:
  /// **'This build cannot receive notifications. Approval works while the app is open, and there is nothing to change in the system settings.'**
  String get pushUnavailableBody;

  /// Title when a rotated push token could not be registered
  ///
  /// In en, this message translates to:
  /// **'Notifications may not arrive'**
  String get pushRotationFailedTitle;

  /// Body when a rotated push token could not be registered
  ///
  /// In en, this message translates to:
  /// **'This device got a new notification address and it could not be registered. Approval from away may not reach you until it is.'**
  String get pushRotationFailedBody;

  /// Title of the screen listing the allowed roots
  ///
  /// In en, this message translates to:
  /// **'Workspaces'**
  String get workspaceListTitle;

  /// Explains what choosing a workspace does
  ///
  /// In en, this message translates to:
  /// **'Pick a folder to open a session in.'**
  String get workspaceListDescription;

  /// Shown while the allowlist is being read
  ///
  /// In en, this message translates to:
  /// **'Loading folders'**
  String get workspaceListLoading;

  /// Title of the empty state of the workspace list
  ///
  /// In en, this message translates to:
  /// **'No folders yet'**
  String get workspaceListEmptyTitle;

  /// Body of the empty state of the workspace list
  ///
  /// In en, this message translates to:
  /// **'Nothing is on the allowlist. It is set on the machine running the backend, not from here.'**
  String get workspaceListEmptyBody;

  /// Shown instead of a date for a root this user has not used
  ///
  /// In en, this message translates to:
  /// **'Never opened'**
  String get workspaceNeverOpened;

  /// Shown when session.start could not leave because the socket is down
  ///
  /// In en, this message translates to:
  /// **'The session was not opened: this device is not connected.'**
  String get workspaceStartRefused;

  /// Title of the live session screen
  ///
  /// In en, this message translates to:
  /// **'Session'**
  String get sessionTitle;

  /// Title of the empty state of the session screen
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get sessionEmptyTitle;

  /// Body of the empty state of the session screen
  ///
  /// In en, this message translates to:
  /// **'Send a prompt to start.'**
  String get sessionEmptyBody;

  /// Placeholder of the prompt field
  ///
  /// In en, this message translates to:
  /// **'Ask Claude something'**
  String get sessionPromptHint;

  /// Action that sends one turn
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get sessionPromptAction;

  /// Shown when a prompt could not leave because the socket is down
  ///
  /// In en, this message translates to:
  /// **'Not sent: this device is not connected.'**
  String get sessionPromptRefused;

  /// Action that interrupts the running turn
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get sessionInterruptAction;

  /// Action that closes the session
  ///
  /// In en, this message translates to:
  /// **'End session'**
  String get sessionCloseAction;

  /// Session status: opened, nothing reported yet
  ///
  /// In en, this message translates to:
  /// **'Starting'**
  String get sessionStatusStarting;

  /// Session status: open with nothing running
  ///
  /// In en, this message translates to:
  /// **'Idle'**
  String get sessionStatusIdle;

  /// Session status: the model is working
  ///
  /// In en, this message translates to:
  /// **'Thinking'**
  String get sessionStatusThinking;

  /// Session status: a tool is running on the user's machine
  ///
  /// In en, this message translates to:
  /// **'Running a tool'**
  String get sessionStatusRunning;

  /// Session status: stopped behind a permission request
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval'**
  String get sessionStatusWaitingPermission;

  /// Session status: over
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get sessionStatusClosed;

  /// Tool invocation still running
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get sessionToolStatusRunning;

  /// Tool invocation that finished well
  ///
  /// In en, this message translates to:
  /// **'Succeeded'**
  String get sessionToolStatusSucceeded;

  /// Tool invocation that failed
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get sessionToolStatusFailed;

  /// Tool invocation somebody refused
  ///
  /// In en, this message translates to:
  /// **'Denied'**
  String get sessionToolStatusDenied;

  /// Label above what a tool printed
  ///
  /// In en, this message translates to:
  /// **'Output'**
  String get sessionToolOutputLabel;

  /// What the last finished turn cost
  ///
  /// In en, this message translates to:
  /// **'{costUsd} USD in {durationMs} ms'**
  String sessionTurnCost(String costUsd, int durationMs);

  /// Why the session closed
  ///
  /// In en, this message translates to:
  /// **'Ended by whoever opened it.'**
  String get sessionClosedByUser;

  /// Why the session closed
  ///
  /// In en, this message translates to:
  /// **'Finished on its own.'**
  String get sessionClosedCompleted;

  /// Why the session closed
  ///
  /// In en, this message translates to:
  /// **'Ended after a failure.'**
  String get sessionClosedFailed;

  /// Why the session closed
  ///
  /// In en, this message translates to:
  /// **'Ended because the audit trail could not be written.'**
  String get sessionClosedAuditUnavailable;

  /// Why the session closed
  ///
  /// In en, this message translates to:
  /// **'Ended because the backend stopped.'**
  String get sessionClosedShutdown;

  /// Why the session closed: the installation reclaimed an idle session
  ///
  /// In en, this message translates to:
  /// **'Ended after sitting idle too long. Resume it from the history.'**
  String get sessionClosedIdleTimeout;

  /// Title of the screen a notification opens
  ///
  /// In en, this message translates to:
  /// **'Permission'**
  String get permissionPageTitle;

  /// Heading above the open permission requests of a session
  ///
  /// In en, this message translates to:
  /// **'Waiting for you'**
  String get permissionQueueTitle;

  /// Explains the permission queue
  ///
  /// In en, this message translates to:
  /// **'Claude has stopped and will not run these until you answer. Silence refuses.'**
  String get permissionQueueDescription;

  /// Accessibility label of a permission card
  ///
  /// In en, this message translates to:
  /// **'Permission for {tool}'**
  String permissionCardLabel(String tool);

  /// What the Bash tool does
  ///
  /// In en, this message translates to:
  /// **'Run a shell command'**
  String get permissionToolBash;

  /// What the Write tool does
  ///
  /// In en, this message translates to:
  /// **'Write a file'**
  String get permissionToolWrite;

  /// What the Edit tool does
  ///
  /// In en, this message translates to:
  /// **'Edit a file'**
  String get permissionToolEdit;

  /// What the MultiEdit tool does
  ///
  /// In en, this message translates to:
  /// **'Edit several files'**
  String get permissionToolMultiEdit;

  /// What the NotebookEdit tool does
  ///
  /// In en, this message translates to:
  /// **'Edit a notebook'**
  String get permissionToolNotebookEdit;

  /// What the Read tool does
  ///
  /// In en, this message translates to:
  /// **'Read a file'**
  String get permissionToolRead;

  /// What the WebFetch tool does
  ///
  /// In en, this message translates to:
  /// **'Fetch a page'**
  String get permissionToolWebFetch;

  /// Fallback label for a tool this build has no words for
  ///
  /// In en, this message translates to:
  /// **'Use {tool}'**
  String permissionToolUnknown(String tool);

  /// Risk of a read-only invocation
  ///
  /// In en, this message translates to:
  /// **'Reads something'**
  String get permissionRiskRead;

  /// Risk of an invocation that writes
  ///
  /// In en, this message translates to:
  /// **'Changes a file'**
  String get permissionRiskWrite;

  /// Risk of a destructive invocation
  ///
  /// In en, this message translates to:
  /// **'Could destroy something'**
  String get permissionRiskDestructive;

  /// Label above the exact command of a permission request
  ///
  /// In en, this message translates to:
  /// **'Exactly what will run'**
  String get permissionCommandLabel;

  /// Countdown until the deadline refuses the request
  ///
  /// In en, this message translates to:
  /// **'{seconds} s left — then it is refused'**
  String permissionRemaining(int seconds);

  /// Allow for this invocation only
  ///
  /// In en, this message translates to:
  /// **'Allow once'**
  String get permissionScopeOnce;

  /// What allowing once means
  ///
  /// In en, this message translates to:
  /// **'Only this command, only now.'**
  String get permissionScopeOnceHint;

  /// Allow every identical request until the session ends
  ///
  /// In en, this message translates to:
  /// **'Allow for this session'**
  String get permissionScopeSession;

  /// What allowing for the session means, and for how long
  ///
  /// In en, this message translates to:
  /// **'Every identical request, until this session ends.'**
  String get permissionScopeSessionHint;

  /// Refuse the request
  ///
  /// In en, this message translates to:
  /// **'Refuse'**
  String get permissionDeny;

  /// Ask the backend to extend the deadline
  ///
  /// In en, this message translates to:
  /// **'Give me more time'**
  String get permissionExtend;

  /// Why the extend action is gone
  ///
  /// In en, this message translates to:
  /// **'This request cannot be extended again.'**
  String get permissionExtendExhausted;

  /// An answer is on its way
  ///
  /// In en, this message translates to:
  /// **'Sending your answer…'**
  String get permissionSending;

  /// Second step of a destructive approval
  ///
  /// In en, this message translates to:
  /// **'This could destroy something. Allow it anyway?'**
  String get permissionConfirmTitle;

  /// Confirms a destructive approval
  ///
  /// In en, this message translates to:
  /// **'Yes, allow it'**
  String get permissionConfirmAction;

  /// Backs out of a destructive approval
  ///
  /// In en, this message translates to:
  /// **'Go back'**
  String get permissionConfirmCancel;

  /// Text of the system biometric or PIN prompt
  ///
  /// In en, this message translates to:
  /// **'Confirm it is you to allow this command on your computer'**
  String get permissionLockReason;

  /// The biometric or PIN prompt did not confirm
  ///
  /// In en, this message translates to:
  /// **'It was not confirmed that this is your phone. Nothing was sent.'**
  String get permissionLockRefused;

  /// Why approving is off on this device
  ///
  /// In en, this message translates to:
  /// **'This phone has no screen lock'**
  String get permissionNoLockTitle;

  /// Explains D-07 and what to do
  ///
  /// In en, this message translates to:
  /// **'A phone without a fingerprint, PIN, pattern or password cannot approve commands. Set a screen lock in the system settings. You can still refuse and watch.'**
  String get permissionNoLockBody;

  /// The answer could not be sent
  ///
  /// In en, this message translates to:
  /// **'Your answer did not leave: the connection is down. Try again when it is back.'**
  String get permissionNotSent;

  /// Why the answer controls are off while offline
  ///
  /// In en, this message translates to:
  /// **'No connection: answering waits for it to come back.'**
  String get permissionOffline;

  /// The socket has not re-delivered the request yet
  ///
  /// In en, this message translates to:
  /// **'Connecting to the session before you can answer…'**
  String get permissionConnecting;

  /// Why the controls are off on a device that may not decide
  ///
  /// In en, this message translates to:
  /// **'This phone cannot answer until it is approved in the browser.'**
  String get permissionDeviceBlocked;

  /// The screen is revalidating the request
  ///
  /// In en, this message translates to:
  /// **'Checking this request with the server…'**
  String get permissionCheckingTitle;

  /// The server no longer knows the request
  ///
  /// In en, this message translates to:
  /// **'This request no longer exists'**
  String get permissionGoneTitle;

  /// Why the request is gone
  ///
  /// In en, this message translates to:
  /// **'The session it belonged to has ended, or the server restarted. There is nothing left to answer.'**
  String get permissionGoneBody;

  /// Goes from the permission screen to its session
  ///
  /// In en, this message translates to:
  /// **'Open the session'**
  String get permissionOpenSession;

  /// How the request ended
  ///
  /// In en, this message translates to:
  /// **'Allowed in the browser.'**
  String get permissionOutcomeAllowedWeb;

  /// How the request ended
  ///
  /// In en, this message translates to:
  /// **'Refused in the browser.'**
  String get permissionOutcomeRefusedWeb;

  /// How the request ended
  ///
  /// In en, this message translates to:
  /// **'Allowed from a phone.'**
  String get permissionOutcomeAllowedPhone;

  /// How the request ended
  ///
  /// In en, this message translates to:
  /// **'Refused from a phone.'**
  String get permissionOutcomeRefusedPhone;

  /// How the request ended, origin unknown
  ///
  /// In en, this message translates to:
  /// **'Allowed.'**
  String get permissionOutcomeAllowed;

  /// How the request ended, origin unknown
  ///
  /// In en, this message translates to:
  /// **'Refused.'**
  String get permissionOutcomeRefused;

  /// A rule answered — for this session, this project or every project
  ///
  /// In en, this message translates to:
  /// **'Allowed by one of your rules, without asking anybody.'**
  String get permissionOutcomeAllowedByRule;

  /// A rule answered — for this session, this project or every project
  ///
  /// In en, this message translates to:
  /// **'Refused by one of your rules, without asking anybody.'**
  String get permissionOutcomeRefusedByRule;

  /// The deadline refused the request
  ///
  /// In en, this message translates to:
  /// **'Refused automatically: nobody answered in time.'**
  String get permissionOutcomeExpired;

  /// Switch that turns the approval lock on or off
  ///
  /// In en, this message translates to:
  /// **'Ask for fingerprint or PIN before approving'**
  String get approvalLockTitle;

  /// Explains the approval lock switch
  ///
  /// In en, this message translates to:
  /// **'On by default. Refusing never asks.'**
  String get approvalLockBody;

  /// Translation of permission.error.requestNotFound
  ///
  /// In en, this message translates to:
  /// **'That request is no longer open.'**
  String get permissionErrorRequestNotFound;

  /// Translation of permission.error.requestExpired
  ///
  /// In en, this message translates to:
  /// **'That request ran out of time.'**
  String get permissionErrorRequestExpired;

  /// Translation of permission.error.notOwned
  ///
  /// In en, this message translates to:
  /// **'That request is not yours to answer.'**
  String get permissionErrorNotOwned;

  /// A yes that leaves a rule for this project
  ///
  /// In en, this message translates to:
  /// **'Don\'t ask again in this project'**
  String get permissionScopeProject;

  /// What the project scope reaches, and for how long
  ///
  /// In en, this message translates to:
  /// **'Matching requests in this project run without asking, for {duration}.'**
  String permissionScopeProjectHint(String duration);

  /// A yes that leaves a rule for every project
  ///
  /// In en, this message translates to:
  /// **'Don\'t ask again anywhere'**
  String get permissionScopeAlways;

  /// What the always scope reaches, and for how long
  ///
  /// In en, this message translates to:
  /// **'Matching requests in any of your projects run without asking, for {duration}.'**
  String permissionScopeAlwaysHint(String duration);

  /// A rule lifetime in days
  ///
  /// In en, this message translates to:
  /// **'{days} days'**
  String permissionRuleDays(int days);

  /// A rule lifetime shorter than a day, in hours
  ///
  /// In en, this message translates to:
  /// **'{hours} hours'**
  String permissionRuleHours(int hours);

  /// Second step of a yes that persists a rule
  ///
  /// In en, this message translates to:
  /// **'Stop asking about this?'**
  String get permissionPersistTitle;

  /// The reach of a project rule, in full
  ///
  /// In en, this message translates to:
  /// **'Claude will run what matches the rule below in this project without asking you, for {duration}.'**
  String permissionPersistProject(String duration);

  /// The reach of an always rule, in full
  ///
  /// In en, this message translates to:
  /// **'Claude will run what matches the rule below in any of your projects without asking you, for {duration}.'**
  String permissionPersistAlways(String duration);

  /// That a persisted rule is revocable, and when revoking takes effect
  ///
  /// In en, this message translates to:
  /// **'You can take it back at any time from your rules. Revoking takes effect on the next request, in every open session.'**
  String get permissionPersistRevocable;

  /// Opens the rules screen from the second step
  ///
  /// In en, this message translates to:
  /// **'See your rules'**
  String get permissionPersistOpenRules;

  /// Confirms a yes that persists a rule
  ///
  /// In en, this message translates to:
  /// **'Allow and stop asking'**
  String get permissionPersistConfirm;

  /// Translation of permission.error.ruleNotFound
  ///
  /// In en, this message translates to:
  /// **'That rule does not exist.'**
  String get permissionErrorRuleNotFound;

  /// Title of the rules screen
  ///
  /// In en, this message translates to:
  /// **'Your rules'**
  String get rulesTitle;

  /// Opens the rules screen
  ///
  /// In en, this message translates to:
  /// **'Rules you granted'**
  String get rulesOpen;

  /// Reloads the rules
  ///
  /// In en, this message translates to:
  /// **'Read the list again'**
  String get rulesReload;

  /// What the rules screen is
  ///
  /// In en, this message translates to:
  /// **'What Claude may do on this machine without asking you first. Revoking takes effect on the next request, in every open session.'**
  String get rulesDescription;

  /// While the rules load
  ///
  /// In en, this message translates to:
  /// **'Loading your rules…'**
  String get rulesLoading;

  /// No rule granted
  ///
  /// In en, this message translates to:
  /// **'No rules yet'**
  String get rulesEmptyTitle;

  /// What a rule is, when there is none
  ///
  /// In en, this message translates to:
  /// **'A rule is created when you answer a request with “don\'t ask again”. Until then, Claude asks you every time.'**
  String get rulesEmptyBody;

  /// Reach of a project rule
  ///
  /// In en, this message translates to:
  /// **'In one project'**
  String get rulesScopeProject;

  /// Reach of an always rule
  ///
  /// In en, this message translates to:
  /// **'In every project'**
  String get rulesScopeAlways;

  /// A rule that allows
  ///
  /// In en, this message translates to:
  /// **'runs without asking'**
  String get rulesDecisionAllow;

  /// A rule that refuses
  ///
  /// In en, this message translates to:
  /// **'refused without asking'**
  String get rulesDecisionDeny;

  /// A rule that still answers
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get rulesStatusActive;

  /// A rule past its expiry
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get rulesStatusExpired;

  /// A rule state this build does not know
  ///
  /// In en, this message translates to:
  /// **'Unknown state'**
  String get rulesStatusUnknown;

  /// Accessible name of a rule row
  ///
  /// In en, this message translates to:
  /// **'Rule {pattern}'**
  String rulesRowLabel(String pattern);

  /// The tool of a rule and what it does
  ///
  /// In en, this message translates to:
  /// **'{tool} · {decision}'**
  String rulesToolDecision(String tool, String decision);

  /// The project a project rule is confined to
  ///
  /// In en, this message translates to:
  /// **'Project: {path}'**
  String rulesProject(String path);

  /// Who granted a rule, and when
  ///
  /// In en, this message translates to:
  /// **'Granted by {who} on {at}'**
  String rulesGranted(String who, String at);

  /// Until when a rule answers
  ///
  /// In en, this message translates to:
  /// **'Valid until {at}'**
  String rulesValidUntil(String at);

  /// When a rule stopped answering
  ///
  /// In en, this message translates to:
  /// **'Expired on {at}. Claude asks you again.'**
  String rulesExpiredOn(String at);

  /// Warning for a rule close to expiring
  ///
  /// In en, this message translates to:
  /// **'Expires soon: after {at}, Claude will ask you again.'**
  String rulesExpiringSoon(String at);

  /// Revokes a rule
  ///
  /// In en, this message translates to:
  /// **'Revoke'**
  String get rulesRevoke;

  /// While a revocation is in flight
  ///
  /// In en, this message translates to:
  /// **'Revoking…'**
  String get rulesRevoking;

  /// The server answered WORKSPACE_NOT_ALLOWED
  ///
  /// In en, this message translates to:
  /// **'This installation does not allow {path}.'**
  String workspaceErrorNotAllowed(String path);

  /// The workspace belongs to somebody else
  ///
  /// In en, this message translates to:
  /// **'That folder is not yours to open.'**
  String get workspaceErrorForbidden;

  /// The server answered SESSION_LIMIT_REACHED
  ///
  /// In en, this message translates to:
  /// **'This machine is already running {limit} sessions, which is as many as it allows. End one and try again.'**
  String sessionErrorLimitReached(String limit);

  /// The server answered CLAUDE_UNAVAILABLE for a session
  ///
  /// In en, this message translates to:
  /// **'Claude stopped responding on this machine.'**
  String get sessionErrorClaudeUnavailable;

  /// The history answered NOT_FOUND
  ///
  /// In en, this message translates to:
  /// **'That conversation does not exist, or it is not yours to read.'**
  String get transcriptErrorNotFound;

  /// The conversation id failed validation
  ///
  /// In en, this message translates to:
  /// **'{sessionId} is not a conversation identifier.'**
  String transcriptErrorInvalidSessionId(String sessionId);

  /// The history answered CLAUDE_UNAVAILABLE
  ///
  /// In en, this message translates to:
  /// **'Claude could not read its history on this machine.'**
  String get transcriptErrorClaudeUnavailable;

  /// The history answered CLAUDE_TIMEOUT
  ///
  /// In en, this message translates to:
  /// **'Claude took too long to read its history. Try again.'**
  String get transcriptErrorClaudeTimeout;

  /// The page cursor no longer points into the conversation
  ///
  /// In en, this message translates to:
  /// **'This conversation changed while you were reading it. Reload it from the latest messages.'**
  String get transcriptErrorCursorStale;

  /// Tooltip of the action that opens the conversations of one folder
  ///
  /// In en, this message translates to:
  /// **'History of {label}'**
  String workspaceHistoryOpen(String label);

  /// Title of the screen listing the conversations of one folder
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get historyListTitle;

  /// Shown while the conversations of a folder are being read
  ///
  /// In en, this message translates to:
  /// **'Loading conversations'**
  String get historyListLoading;

  /// Title of the empty state of the conversation list
  ///
  /// In en, this message translates to:
  /// **'No conversations in this folder'**
  String get historyListEmptyTitle;

  /// Body of the empty state of the conversation list: what to do about it
  ///
  /// In en, this message translates to:
  /// **'Nothing has been said here yet — from this app, the editor or the terminal. Open a session on this folder from the folder list to start one.'**
  String get historyListEmptyBody;

  /// Origin of a conversation opened from this product
  ///
  /// In en, this message translates to:
  /// **'Opened from this app'**
  String get historyOriginOurs;

  /// Origin of a conversation begun in the editor or the terminal — never name the editor: nothing says which
  ///
  /// In en, this message translates to:
  /// **'Began outside this app'**
  String get historyOriginExternal;

  /// When anything was last said in a conversation
  ///
  /// In en, this message translates to:
  /// **'Last active {at}'**
  String historyLastActive(String at);

  /// The git branch the conversation ran on
  ///
  /// In en, this message translates to:
  /// **'Branch {branch}'**
  String historyBranch(String branch);

  /// Shown for a conversation the store gives no summary
  ///
  /// In en, this message translates to:
  /// **'Untitled conversation'**
  String get historyUntitled;

  /// Reads the next page of conversations
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get historyLoadMore;

  /// While the next or the earlier page is being read
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get historyLoadingMore;

  /// Title of the read-only screen of one conversation
  ///
  /// In en, this message translates to:
  /// **'Conversation'**
  String get historyConversationTitle;

  /// Shown while the latest messages of a conversation are being read
  ///
  /// In en, this message translates to:
  /// **'Loading the conversation'**
  String get historyConversationLoading;

  /// Title of the empty state of a conversation
  ///
  /// In en, this message translates to:
  /// **'Nothing said in this conversation'**
  String get historyConversationEmptyTitle;

  /// Body of the empty state of a conversation: what to do about it
  ///
  /// In en, this message translates to:
  /// **'It has no messages to show. Resume it to say something.'**
  String get historyConversationEmptyBody;

  /// Reads the page before the oldest message on screen
  ///
  /// In en, this message translates to:
  /// **'Load earlier messages'**
  String get historyLoadEarlier;

  /// Continues the conversation in a live session
  ///
  /// In en, this message translates to:
  /// **'Resume'**
  String get historyResumeAction;

  /// While the resume waits for the session that continues it
  ///
  /// In en, this message translates to:
  /// **'Resuming…'**
  String get historyResumePending;

  /// Why the resume button is disabled
  ///
  /// In en, this message translates to:
  /// **'Resuming needs the connection to the backend, and this device is not connected.'**
  String get historyResumeOffline;

  /// Shown when the resume could not leave because the socket is down
  ///
  /// In en, this message translates to:
  /// **'The conversation was not resumed: this device is not connected.'**
  String get historyResumeNotSent;

  /// Said before resuming a conversation begun elsewhere (D-04)
  ///
  /// In en, this message translates to:
  /// **'This conversation began outside this app. Resuming it here continues it under a new id: the editor or terminal it came from will not see the answers given here.'**
  String get historyExternalNote;

  /// While the history of a resumed or reloaded session is being read
  ///
  /// In en, this message translates to:
  /// **'Loading what was said before'**
  String get sessionHistoryLoading;

  /// The server answered INVALID_INPUT for a slash command the installation does not have
  ///
  /// In en, this message translates to:
  /// **'{command} is not a command Claude offers on this machine.'**
  String sessionErrorUnknownCommand(String command);

  /// The server answered CLAUDE_TIMEOUT for a session
  ///
  /// In en, this message translates to:
  /// **'Claude took too long to answer on this machine. Try again.'**
  String get sessionErrorClaudeTimeout;

  /// A resume got no answer before the client's deadline
  ///
  /// In en, this message translates to:
  /// **'The backend did not answer the resume. Check the connection and try again.'**
  String get sessionErrorResumeTimeout;

  /// The server answered SESSION_LOCKED to an undo
  ///
  /// In en, this message translates to:
  /// **'The session is busy: a turn is running or another undo is in progress. Try again once it is idle.'**
  String get sessionErrorLocked;

  /// The server answered INVALID_INPUT: the undo point is not one of this session's
  ///
  /// In en, this message translates to:
  /// **'That undo point does not belong to this session.'**
  String get sessionErrorRewindTargetUnknown;

  /// The session reported an undo that could not restore every file
  ///
  /// In en, this message translates to:
  /// **'Some files could not be put back ({failed}). Each of them was left exactly as it was.'**
  String sessionErrorRewindIncomplete(String failed);

  /// Tooltip of the button that opens the slash command menu
  ///
  /// In en, this message translates to:
  /// **'Commands'**
  String get sessionCommandsOpen;

  /// Title of the slash command menu
  ///
  /// In en, this message translates to:
  /// **'Commands'**
  String get sessionCommandsTitle;

  /// What the command menu is — discovery, not a boundary (D-05)
  ///
  /// In en, this message translates to:
  /// **'What Claude offers on this machine. The prompt box accepts any command, listed here or not.'**
  String get sessionCommandsDescription;

  /// Label of the search box of the command menu
  ///
  /// In en, this message translates to:
  /// **'Search commands'**
  String get sessionCommandsSearch;

  /// Heading of the group of suggested commands
  ///
  /// In en, this message translates to:
  /// **'Suggested'**
  String get sessionCommandsSuggested;

  /// Heading of every other command
  ///
  /// In en, this message translates to:
  /// **'All commands'**
  String get sessionCommandsAll;

  /// While the commands of the installation are being read
  ///
  /// In en, this message translates to:
  /// **'Loading commands'**
  String get sessionCommandsLoading;

  /// Title of the empty state of the command menu
  ///
  /// In en, this message translates to:
  /// **'No commands on this machine'**
  String get sessionCommandsEmptyTitle;

  /// Body of the empty state of the command menu: what to do about it
  ///
  /// In en, this message translates to:
  /// **'Claude here offers no commands. You can still type anything in the prompt box.'**
  String get sessionCommandsEmptyBody;

  /// Shown when the search of the command menu finds nothing
  ///
  /// In en, this message translates to:
  /// **'No command matches “{query}”.'**
  String sessionCommandsNoMatch(String query);

  /// Tooltip of the action that opens the undo sheet
  ///
  /// In en, this message translates to:
  /// **'Undo file changes'**
  String get sessionUndoOpen;

  /// Title of the undo sheet
  ///
  /// In en, this message translates to:
  /// **'Undo file changes'**
  String get sessionUndoTitle;

  /// What undoing does, above the list of undo points
  ///
  /// In en, this message translates to:
  /// **'Put the files this session wrote back to how they were before one of its turns. A file changed outside the session stays as it is.'**
  String get sessionUndoDescription;

  /// While the undo points of the session are being read
  ///
  /// In en, this message translates to:
  /// **'Loading undo points'**
  String get sessionUndoLoading;

  /// Title of the empty state of the undo sheet
  ///
  /// In en, this message translates to:
  /// **'Nothing to undo yet'**
  String get sessionUndoEmptyTitle;

  /// Body of the empty state of the undo sheet
  ///
  /// In en, this message translates to:
  /// **'Every turn that writes files becomes a point this session can go back to.'**
  String get sessionUndoEmptyBody;

  /// Shown for an undo point whose turn had no prompt
  ///
  /// In en, this message translates to:
  /// **'Untitled turn'**
  String get sessionUndoUntitled;

  /// When the turn of an undo point began
  ///
  /// In en, this message translates to:
  /// **'{date} at {time}'**
  String sessionUndoPointAt(String date, String time);

  /// How many files an undo point reaches
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No files} =1{1 file} other{{count} files}}'**
  String sessionUndoFileCount(int count);

  /// Heading of the confirmation: the point the files go back to
  ///
  /// In en, this message translates to:
  /// **'Go back to before “{label}”'**
  String sessionUndoConfirmTitle(String label);

  /// Heading of the files an undo would put back
  ///
  /// In en, this message translates to:
  /// **'Goes back'**
  String get sessionUndoGoesBack;

  /// Heading of the files an undo would leave alone
  ///
  /// In en, this message translates to:
  /// **'Stays as it is'**
  String get sessionUndoStays;

  /// Heading of the files already the way they were before the turn
  ///
  /// In en, this message translates to:
  /// **'Already as it was'**
  String get sessionUndoAlready;

  /// What undoing does to a file the turn changed
  ///
  /// In en, this message translates to:
  /// **'Its content before the turn is put back'**
  String get sessionUndoRestore;

  /// What undoing does to a file the turn created
  ///
  /// In en, this message translates to:
  /// **'Deleted: this turn created it'**
  String get sessionUndoDelete;

  /// Why a file stays: somebody edited it after the session
  ///
  /// In en, this message translates to:
  /// **'Changed outside the session after it wrote it'**
  String get sessionUndoReasonModifiedOutside;

  /// Why a file stays: no snapshot of it could be taken
  ///
  /// In en, this message translates to:
  /// **'Too large or unreadable to have been saved'**
  String get sessionUndoReasonNotRestorable;

  /// Why a file stays: it became a link or its directory moved
  ///
  /// In en, this message translates to:
  /// **'No longer a regular file, or its folder no longer resolves'**
  String get sessionUndoReasonUnsafePath;

  /// Why a file stays: the undo will not guess
  ///
  /// In en, this message translates to:
  /// **'Nothing records how the session left it'**
  String get sessionUndoReasonNoBaseline;

  /// Why a file stays, when the reason is newer than this app
  ///
  /// In en, this message translates to:
  /// **'Kept for a reason this app does not know'**
  String get sessionUndoReasonOther;

  /// Why the undo button is disabled for this point
  ///
  /// In en, this message translates to:
  /// **'Nothing would change: no file of this point can go back.'**
  String get sessionUndoNothingToRevert;

  /// Confirms the undo, once the files are listed
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get sessionUndoConfirm;

  /// While the undo waits for its result
  ///
  /// In en, this message translates to:
  /// **'Undoing…'**
  String get sessionUndoPending;

  /// Leaves the confirmation or the result for the list
  ///
  /// In en, this message translates to:
  /// **'Back to the undo points'**
  String get sessionUndoBack;

  /// Why the undo button is disabled while a turn runs
  ///
  /// In en, this message translates to:
  /// **'Undo is available only while the session is idle. Wait for the turn to finish.'**
  String get sessionUndoBusy;

  /// What the undo sheet says for a closed session
  ///
  /// In en, this message translates to:
  /// **'This session is closed, so its files can no longer be undone from here.'**
  String get sessionUndoClosed;

  /// Why the undo button is disabled while offline
  ///
  /// In en, this message translates to:
  /// **'Undoing needs the connection to the backend, and this device is not connected.'**
  String get sessionUndoOffline;

  /// Shown when the undo could not leave because the socket is down
  ///
  /// In en, this message translates to:
  /// **'Nothing was undone: this device is not connected.'**
  String get sessionUndoNotSent;

  /// Heading of the result of an undo
  ///
  /// In en, this message translates to:
  /// **'The undo is done'**
  String get sessionUndoDoneTitle;

  /// Heading of the files the undo put back
  ///
  /// In en, this message translates to:
  /// **'Put back'**
  String get sessionUndoReverted;

  /// A file the undo put back
  ///
  /// In en, this message translates to:
  /// **'Restored to how it was before the turn'**
  String get sessionUndoRestored;

  /// A file the undo removed
  ///
  /// In en, this message translates to:
  /// **'Deleted: the turn had created it'**
  String get sessionUndoDeleted;

  /// Heading of the files the undo could not restore
  ///
  /// In en, this message translates to:
  /// **'Could not be put back'**
  String get sessionUndoFailed;

  /// Title of the diagnostics screen
  ///
  /// In en, this message translates to:
  /// **'Diagnostics'**
  String get diagnosticsTitle;

  /// Label of the connection state
  ///
  /// In en, this message translates to:
  /// **'Connection'**
  String get diagnosticsConnectionLabel;

  /// Label of the credential state
  ///
  /// In en, this message translates to:
  /// **'Sign-in'**
  String get diagnosticsCredentialLabel;

  /// This installation holds a credential
  ///
  /// In en, this message translates to:
  /// **'Signed in'**
  String get diagnosticsCredentialPresent;

  /// This installation holds no credential
  ///
  /// In en, this message translates to:
  /// **'Not signed in'**
  String get diagnosticsCredentialAbsent;

  /// Label of the app version
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get diagnosticsVersionLabel;

  /// Switch that turns debug logging on
  ///
  /// In en, this message translates to:
  /// **'Detailed logging'**
  String get diagnosticsDebugLabel;

  /// What the debug switch does
  ///
  /// In en, this message translates to:
  /// **'Records every exchange with the server while this screen is open. It switches itself off when you leave.'**
  String get diagnosticsDebugDescription;

  /// The debug switch does nothing in a debug build
  ///
  /// In en, this message translates to:
  /// **'Always on in a development build.'**
  String get diagnosticsDebugAlwaysOn;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'pt'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'pt':
      return AppLocalizationsPt();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
