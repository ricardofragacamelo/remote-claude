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

  /// Tool invocation still running
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get sessionToolStatusRunning;

  /// Tool invocation that finished well
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get sessionToolStatusSucceeded;

  /// Tool invocation that failed
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get sessionToolStatusFailed;

  /// Tool invocation somebody refused
  ///
  /// In en, this message translates to:
  /// **'Refused'**
  String get sessionToolStatusDenied;

  /// Label of a tool with the description the model gave the call
  ///
  /// In en, this message translates to:
  /// **'{name} · {title}'**
  String sessionToolTitled(String name, String title);

  /// Accessible name of the line of a tool, which opens its card
  ///
  /// In en, this message translates to:
  /// **'{tool} — {status}. Show the exact input'**
  String sessionToolRowLabel(String tool, String status);

  /// Tag of what went into a shell command
  ///
  /// In en, this message translates to:
  /// **'IN'**
  String get sessionToolRowIn;

  /// Tag of what came out of a shell command
  ///
  /// In en, this message translates to:
  /// **'OUT'**
  String get sessionToolRowOut;

  /// Accessible name of the exact input of a tool
  ///
  /// In en, this message translates to:
  /// **'The exact input'**
  String get sessionToolRowInput;

  /// Accessible name of what a tool said
  ///
  /// In en, this message translates to:
  /// **'What it said'**
  String get sessionToolRowOutput;

  /// The whole output of a tool is being read
  ///
  /// In en, this message translates to:
  /// **'Loading the whole output…'**
  String get sessionToolRowOutputLoading;

  /// The whole output of a tool could not be read; its end stays
  ///
  /// In en, this message translates to:
  /// **'The whole output did not load — this is only its end.'**
  String get sessionToolRowOutputFailed;

  /// The server sent only the start and the end of a large output
  ///
  /// In en, this message translates to:
  /// **'The output had {size}: only its start and its end are here, cut where it is marked.'**
  String sessionToolRowOutputTruncated(String size);

  /// Marker where the middle of a large output was left out
  ///
  /// In en, this message translates to:
  /// **'[… the middle of the output was left out here …]'**
  String get sessionToolRowOutputCut;

  /// Marker of an image a prompt carried, of unknown type and size
  ///
  /// In en, this message translates to:
  /// **'Attached image'**
  String get sessionImageAttached;

  /// Marker of an image a prompt carried, with its type and size
  ///
  /// In en, this message translates to:
  /// **'Attached image ({details})'**
  String sessionImageAttachedWith(String details);

  /// Opens the image a prompt carried
  ///
  /// In en, this message translates to:
  /// **'Open the image'**
  String get sessionImageOpen;

  /// Closes the screen of a prompt's image
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get sessionImageClose;

  /// What the screen of a prompt's image shows
  ///
  /// In en, this message translates to:
  /// **'The image this prompt carried, as Claude received it.'**
  String get sessionImageDescription;

  /// The image of a prompt is being read
  ///
  /// In en, this message translates to:
  /// **'Loading the image…'**
  String get sessionImageLoading;

  /// Accessible name of the image of a prompt
  ///
  /// In en, this message translates to:
  /// **'The image attached to the prompt'**
  String get sessionImageAlt;

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

  /// Allow everything (allowAll) answered — the session runs without asking
  ///
  /// In en, this message translates to:
  /// **'Allowed by Allow everything, without asking anybody.'**
  String get permissionOutcomeAllowedByAllowAll;

  /// The reach of a rule left by this answer — label
  ///
  /// In en, this message translates to:
  /// **'How far'**
  String get permissionReachLabel;

  /// The reach of a rule left by this answer — exact
  ///
  /// In en, this message translates to:
  /// **'Exactly this'**
  String get permissionReachExact;

  /// The reach of a rule left by this answer — prefix
  ///
  /// In en, this message translates to:
  /// **'Commands that start the same way'**
  String get permissionReachPrefix;

  /// The reach of a rule left by this answer — tool
  ///
  /// In en, this message translates to:
  /// **'Any use of this tool'**
  String get permissionReachTool;

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

  /// What the AskUserQuestion tool does
  ///
  /// In en, this message translates to:
  /// **'Answer Claude\'s question'**
  String get permissionToolAskUserQuestion;

  /// Accessibility label of the card of a question Claude asks
  ///
  /// In en, this message translates to:
  /// **'Claude\'s question'**
  String get permissionQuestionLabel;

  /// Which step of the questions is on screen
  ///
  /// In en, this message translates to:
  /// **'Question {n} of {total}'**
  String permissionQuestionProgress(int n, int total);

  /// The mark of a question that has an answer
  ///
  /// In en, this message translates to:
  /// **'answered'**
  String get permissionQuestionAnswered;

  /// The free answer, always the last option
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get permissionQuestionOther;

  /// The field of the free answer
  ///
  /// In en, this message translates to:
  /// **'Type your answer…'**
  String get permissionQuestionOtherPlaceholder;

  /// The mark of the option Claude recommends
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get permissionQuestionRecommended;

  /// Title of the sheet with the preview of an option
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get permissionQuestionPreview;

  /// Opens the preview of an option
  ///
  /// In en, this message translates to:
  /// **'See preview'**
  String get permissionQuestionSeePreview;

  /// Goes to the previous question
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get permissionQuestionBack;

  /// Goes to the next question
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get permissionQuestionNext;

  /// Sends the answers to Claude
  ///
  /// In en, this message translates to:
  /// **'Send answers'**
  String get permissionQuestionSubmit;

  /// Refuses to answer the question
  ///
  /// In en, this message translates to:
  /// **'Don\'t answer'**
  String get permissionQuestionDecline;

  /// The optional reason for not answering
  ///
  /// In en, this message translates to:
  /// **'Why not? Claude reads this (optional)'**
  String get permissionQuestionDeclineReason;

  /// Confirms not answering
  ///
  /// In en, this message translates to:
  /// **'Send without answering'**
  String get permissionQuestionDeclineConfirm;

  /// Leaves the refusal and goes back to the questions
  ///
  /// In en, this message translates to:
  /// **'Back to the questions'**
  String get permissionQuestionDeclineBack;

  /// A question nobody answered in time
  ///
  /// In en, this message translates to:
  /// **'This question ran out of time. Nothing was sent.'**
  String get permissionQuestionExpired;

  /// A question whose input could not be read
  ///
  /// In en, this message translates to:
  /// **'Claude\'s question could not be read, so it cannot be answered here. Declining tells Claude so.'**
  String get permissionQuestionMalformed;

  /// The working indicator: a question of Claude waits
  ///
  /// In en, this message translates to:
  /// **'Waiting for your answer to a question'**
  String get permissionQuestionWaiting;

  /// The pill over the box with a question of Claude out of view
  ///
  /// In en, this message translates to:
  /// **'Claude asked you something ({count})'**
  String permissionQuestionPill(String count);

  /// The line of a tool that asked one question
  ///
  /// In en, this message translates to:
  /// **'Asked: {header}'**
  String permissionQuestionAsked(String header);

  /// The line of a tool that asked several questions
  ///
  /// In en, this message translates to:
  /// **'Asked {count} questions'**
  String permissionQuestionAskedMany(int count);

  /// A question not answered yet
  ///
  /// In en, this message translates to:
  /// **'Waiting for an answer'**
  String get permissionQuestionPending;

  /// A question somebody chose not to answer
  ///
  /// In en, this message translates to:
  /// **'Not answered: {reason}'**
  String permissionQuestionDeclined(String reason);

  /// A question answered in another client
  ///
  /// In en, this message translates to:
  /// **'Answered elsewhere'**
  String get permissionQuestionAnsweredElsewhere;

  /// The answers were refused by the server
  ///
  /// In en, this message translates to:
  /// **'Those answers do not fit the question. Check each one and send again.'**
  String get permissionErrorAnswersInvalid;

  /// A free answer, as it was given
  ///
  /// In en, this message translates to:
  /// **'Other: {text}'**
  String permissionQuestionOtherAnswer(String text);

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

  /// The server answered TRANSCRIPT_FOLLOW_LIMIT to following a conversation
  ///
  /// In en, this message translates to:
  /// **'Too many conversations are being followed right now ({limit} at most). This one stays readable, but it will not update by itself.'**
  String transcriptErrorFollowLimit(String limit);

  /// The server answered TRANSCRIPT_FOLLOW_LIVE_HERE: a live session of the caller holds the conversation
  ///
  /// In en, this message translates to:
  /// **'This conversation is open in a live session here. Open that session to see it as it goes.'**
  String get transcriptErrorFollowLiveHere;

  /// The image of a prompt of the history is of a type the route does not serve (415)
  ///
  /// In en, this message translates to:
  /// **'This image cannot be shown here: {mediaType} is not a type the server serves.'**
  String transcriptErrorImageTypeUnsupported(String mediaType);

  /// The image of a prompt of the history is above the ceiling of the route (413)
  ///
  /// In en, this message translates to:
  /// **'This image is too large to show here.'**
  String get transcriptErrorImageTooLarge;

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
  /// **'Continue this conversation'**
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

  /// Said while the conversation's activity is activeElsewhere (plan 22, B-26); the same text as the web's history.screen.activeElsewhereNote
  ///
  /// In en, this message translates to:
  /// **'Something else wrote this conversation a moment ago — the editor or a terminal may have it open. Continuing it here makes a copy, and the two will diverge.'**
  String get historyActiveElsewhereNote;

  /// The followed conversation seems to have a turn running in another client — an inference (plan 22, D-12)
  ///
  /// In en, this message translates to:
  /// **'Working in another client…'**
  String get historyFollowWorking;

  /// The help of "Working in another client…": why it is an inference
  ///
  /// In en, this message translates to:
  /// **'This is an inference, not something Claude reported: the conversation\'s last entry leaves the turn open — a tool without its result, a thought, or a prompt without an answer — and something wrote it a moment ago. The history does not record the state of a turn, and nothing here says which client it is.'**
  String get historyFollowWorkingHelp;

  /// The pill over a followed conversation scrolled up, with one entry arrived below; the same as the web's history.follow.newerOne
  ///
  /// In en, this message translates to:
  /// **'1 new'**
  String get historyFollowNewerOne;

  /// The pill over a followed conversation scrolled up: how many entries arrived below; the same as the web's history.follow.newer
  ///
  /// In en, this message translates to:
  /// **'{count} new'**
  String historyFollowNewer(int count);

  /// What the pill does, for a screen reader and a long press
  ///
  /// In en, this message translates to:
  /// **'Go to the end — {newer}'**
  String historyFollowNewerLabel(String newer);

  /// Asks before continuing a conversation that is active elsewhere; the same as the web's sessions.fork.title
  ///
  /// In en, this message translates to:
  /// **'Continue a conversation that is being written now?'**
  String get sessionForkTitle;

  /// What continuing an active conversation does
  ///
  /// In en, this message translates to:
  /// **'Something else — the editor or a terminal — wrote this conversation a moment ago. Continuing it here makes a copy under a new id; the other one keeps going on its own, and the two will diverge.'**
  String get sessionForkDescription;

  /// Does not continue the active conversation
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get sessionForkCancel;

  /// Continues the active conversation as a copy
  ///
  /// In en, this message translates to:
  /// **'Continue as a copy'**
  String get sessionForkConfirm;

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

  /// Strip above the box of a closed session: sending resumes it
  ///
  /// In en, this message translates to:
  /// **'Sending a prompt resumes it, in a new process of Claude on this machine.'**
  String get sessionEndedResumes;

  /// Send button of a closed session
  ///
  /// In en, this message translates to:
  /// **'Resume and send'**
  String get sessionEndedResumeAndSend;

  /// The resume of a closed session is on its way
  ///
  /// In en, this message translates to:
  /// **'Resuming the conversation…'**
  String get sessionEndedResuming;

  /// Hint of a one-line strip: a tap opens the whole explanation
  ///
  /// In en, this message translates to:
  /// **'Show all of it'**
  String get commonActionShowAll;

  /// One-line summary that closes a turn in the conversation
  ///
  /// In en, this message translates to:
  /// **'Turn ended: {costUsd} USD · {seconds} s'**
  String sessionTurnLine(String costUsd, String seconds);

  /// Line where the conversation was compacted on request
  ///
  /// In en, this message translates to:
  /// **'Compacted on request: what came before is a summary now'**
  String get sessionCompactedManual;

  /// Line where the conversation was compacted automatically
  ///
  /// In en, this message translates to:
  /// **'Compacted on its own, the context was full: what came before is a summary now'**
  String get sessionCompactedAuto;

  /// Line where the conversation was compacted on request, with the size
  ///
  /// In en, this message translates to:
  /// **'Compacted on request: {tokens} tokens before are a summary now'**
  String sessionCompactedManualTokens(String tokens);

  /// Line where the conversation was compacted automatically, with the size
  ///
  /// In en, this message translates to:
  /// **'Compacted on its own, the context was full: {tokens} tokens before are a summary now'**
  String sessionCompactedAutoTokens(String tokens);

  /// Thinking line while the model thinks
  ///
  /// In en, this message translates to:
  /// **'Thinking…'**
  String get thinkingLive;

  /// Thinking line once it stopped, without a duration
  ///
  /// In en, this message translates to:
  /// **'Thought'**
  String get thinkingDone;

  /// Thinking line once it stopped, with its duration
  ///
  /// In en, this message translates to:
  /// **'Thought for {seconds} s'**
  String thinkingTook(String seconds);

  /// Thinking line once it stopped, with its duration of a minute or more
  ///
  /// In en, this message translates to:
  /// **'Thought for {minutes} min {seconds} s'**
  String thinkingTookMinutes(String minutes, String seconds);

  /// Thinking line read from the history: at most how long it took
  ///
  /// In en, this message translates to:
  /// **'Thought for up to {seconds} s'**
  String thinkingTookUpTo(String seconds);

  /// Thinking line read from the history: at most how long it took, a minute or more
  ///
  /// In en, this message translates to:
  /// **'Thought for up to {minutes} min {seconds} s'**
  String thinkingTookUpToMinutes(String minutes, String seconds);

  /// Thinking line of a redacted thinking
  ///
  /// In en, this message translates to:
  /// **'Thought — the model did not show it'**
  String get thinkingHidden;

  /// Expanded redacted thinking
  ///
  /// In en, this message translates to:
  /// **'The model thought here and did not show what it thought.'**
  String get thinkingNothingShown;

  /// Title of the draft screen
  ///
  /// In en, this message translates to:
  /// **'A new conversation'**
  String get draftTitle;

  /// What the draft is
  ///
  /// In en, this message translates to:
  /// **'Nothing runs until you send the first prompt: then a session of Claude opens in this folder, with what you chose below.'**
  String get draftDescription;

  /// Hint of the draft
  ///
  /// In en, this message translates to:
  /// **'Type / for the commands and skills of this installation.'**
  String get draftCommands;

  /// Hint of a draft with no models listed
  ///
  /// In en, this message translates to:
  /// **'The models of this installation appear once a session of this folder has run; until then, the installation\'s default is used.'**
  String get draftDefaultModel;

  /// The first send of a draft is opening the session
  ///
  /// In en, this message translates to:
  /// **'Opening the session…'**
  String get draftStarting;

  /// Catalogue of the draft refused or unreadable
  ///
  /// In en, this message translates to:
  /// **'The choices of this installation could not be read, so the conversation starts with its defaults: {reason}'**
  String draftCatalogFailed(String reason);

  /// Label of the prompt box
  ///
  /// In en, this message translates to:
  /// **'Prompt'**
  String get composerBoxLabel;

  /// Placeholder of the prompt box
  ///
  /// In en, this message translates to:
  /// **'Ask Claude to do something in this folder…'**
  String get composerPlaceholder;

  /// Send button while a turn runs
  ///
  /// In en, this message translates to:
  /// **'Add to queue'**
  String get composerQueue;

  /// Said while a turn runs and the box has text
  ///
  /// In en, this message translates to:
  /// **'Claude is working: what you send now waits in the queue and runs next.'**
  String get composerQueued;

  /// Stops the turn that is running
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get composerStop;

  /// Why the send button does nothing with an empty box
  ///
  /// In en, this message translates to:
  /// **'Write a prompt to send.'**
  String get composerEmpty;

  /// Opens the commands sheet
  ///
  /// In en, this message translates to:
  /// **'Commands and skills (/)'**
  String get composerSlash;

  /// Overflow of the composer bar
  ///
  /// In en, this message translates to:
  /// **'More choices: the model, the effort and the context'**
  String get composerMore;

  /// Closes the refusal strip
  ///
  /// In en, this message translates to:
  /// **'Close this message'**
  String get composerRefusalClose;

  /// A real block above the box
  ///
  /// In en, this message translates to:
  /// **'Nothing can be sent right now: {reason}'**
  String composerBlocked(String reason);

  /// Accessible name of a chip of the bar
  ///
  /// In en, this message translates to:
  /// **'{label}: {value}'**
  String composerChoice(String label, String value);

  /// A change of a chip is on its way
  ///
  /// In en, this message translates to:
  /// **'Changing…'**
  String get composerChoicePending;

  /// Mode chip
  ///
  /// In en, this message translates to:
  /// **'Mode'**
  String get modeLabel;

  /// Mode default
  ///
  /// In en, this message translates to:
  /// **'Ask me'**
  String get modeDefault;

  /// modeDefaultDescription
  ///
  /// In en, this message translates to:
  /// **'Claude asks before every tool that needs your word.'**
  String get modeDefaultDescription;

  /// modeAcceptEdits
  ///
  /// In en, this message translates to:
  /// **'Accept edits'**
  String get modeAcceptEdits;

  /// modeAcceptEditsDescription
  ///
  /// In en, this message translates to:
  /// **'Claude edits and writes files without asking; it still asks before anything else.'**
  String get modeAcceptEditsDescription;

  /// modeAcceptEditsWarning
  ///
  /// In en, this message translates to:
  /// **'Claude will edit and write files without asking you — and without the preview of the change.'**
  String get modeAcceptEditsWarning;

  /// modePlan
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get modePlan;

  /// modePlanDescription
  ///
  /// In en, this message translates to:
  /// **'Claude plans without changing anything, and asks you to approve the plan.'**
  String get modePlanDescription;

  /// modeAllowAll
  ///
  /// In en, this message translates to:
  /// **'Allow everything'**
  String get modeAllowAll;

  /// modeAllowAllDescription
  ///
  /// In en, this message translates to:
  /// **'Claude runs every tool without asking, except what one of your rules refuses. Its questions to you still come.'**
  String get modeAllowAllDescription;

  /// modeAllowAllWarning
  ///
  /// In en, this message translates to:
  /// **'Claude will run any command on this machine without asking you, until you change the mode.'**
  String get modeAllowAllWarning;

  /// Model chip
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get modelLabel;

  /// modelDefault
  ///
  /// In en, this message translates to:
  /// **'Installation default'**
  String get modelDefault;

  /// modelsFailed
  ///
  /// In en, this message translates to:
  /// **'The models of this installation could not be read: {reason}'**
  String modelsFailed(String reason);

  /// modelsLoading
  ///
  /// In en, this message translates to:
  /// **'Loading the models'**
  String get modelsLoading;

  /// Effort chip
  ///
  /// In en, this message translates to:
  /// **'Effort'**
  String get effortLabel;

  /// effortDefault
  ///
  /// In en, this message translates to:
  /// **'Default effort'**
  String get effortDefault;

  /// effortLow
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get effortLow;

  /// effortMedium
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get effortMedium;

  /// effortHigh
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get effortHigh;

  /// effortXhigh
  ///
  /// In en, this message translates to:
  /// **'Extra high'**
  String get effortXhigh;

  /// effortMax
  ///
  /// In en, this message translates to:
  /// **'Maximum'**
  String get effortMax;

  /// effortReadOnly
  ///
  /// In en, this message translates to:
  /// **'The effort is chosen when a conversation starts. Changing it in a running one would stop Claude from asking before each tool.'**
  String get effortReadOnly;

  /// effortUnknown
  ///
  /// In en, this message translates to:
  /// **'As it started'**
  String get effortUnknown;

  /// queueTitle
  ///
  /// In en, this message translates to:
  /// **'Waiting prompts'**
  String get queueTitle;

  /// queueDescription
  ///
  /// In en, this message translates to:
  /// **'These run one after the other, as their own turns, when the turn running ends.'**
  String get queueDescription;

  /// queueCancel
  ///
  /// In en, this message translates to:
  /// **'Take prompt {position} out of the queue'**
  String queueCancel(String position);

  /// queuePosition
  ///
  /// In en, this message translates to:
  /// **'#{position}'**
  String queuePosition(String position);

  /// queueFromWeb
  ///
  /// In en, this message translates to:
  /// **'from a browser'**
  String get queueFromWeb;

  /// queueFromMobile
  ///
  /// In en, this message translates to:
  /// **'from the phone'**
  String get queueFromMobile;

  /// queueFromOther
  ///
  /// In en, this message translates to:
  /// **'from another client'**
  String get queueFromOther;

  /// contextLabel
  ///
  /// In en, this message translates to:
  /// **'Context window {percentage}% used'**
  String contextLabel(String percentage);

  /// contextPercentage
  ///
  /// In en, this message translates to:
  /// **'{percentage}%'**
  String contextPercentage(String percentage);

  /// contextWindow
  ///
  /// In en, this message translates to:
  /// **'{total} of {max} tokens'**
  String contextWindow(String total, String max);

  /// contextTokens
  ///
  /// In en, this message translates to:
  /// **'{tokens} tokens'**
  String contextTokens(String tokens);

  /// contextNear
  ///
  /// In en, this message translates to:
  /// **'The conversation is near the limit of its context. Compacting it keeps it going.'**
  String get contextNear;

  /// contextCompact
  ///
  /// In en, this message translates to:
  /// **'Compact the conversation (/compact)'**
  String get contextCompact;

  /// contextCompacting
  ///
  /// In en, this message translates to:
  /// **'Compacting…'**
  String get contextCompacting;

  /// contextUnavailable
  ///
  /// In en, this message translates to:
  /// **'The use of the context could not be read.'**
  String get contextUnavailable;

  /// contextLoading
  ///
  /// In en, this message translates to:
  /// **'Reading the context'**
  String get contextLoading;

  /// contextSystemPrompt
  ///
  /// In en, this message translates to:
  /// **'System prompt'**
  String get contextSystemPrompt;

  /// contextSystemTools
  ///
  /// In en, this message translates to:
  /// **'System tools'**
  String get contextSystemTools;

  /// contextMcpTools
  ///
  /// In en, this message translates to:
  /// **'MCP tools'**
  String get contextMcpTools;

  /// contextMessages
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get contextMessages;

  /// contextMemoryFiles
  ///
  /// In en, this message translates to:
  /// **'Memory files'**
  String get contextMemoryFiles;

  /// contextSkills
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get contextSkills;

  /// contextFreeSpace
  ///
  /// In en, this message translates to:
  /// **'Free space'**
  String get contextFreeSpace;

  /// contextBuffer
  ///
  /// In en, this message translates to:
  /// **'Reserved for compaction'**
  String get contextBuffer;

  /// sessionErrorQueuedPromptStarted
  ///
  /// In en, this message translates to:
  /// **'That prompt has already started. Interrupt the turn to stop it.'**
  String get sessionErrorQueuedPromptStarted;

  /// sessionErrorQueuedPromptNotFound
  ///
  /// In en, this message translates to:
  /// **'That prompt is no longer in the queue.'**
  String get sessionErrorQueuedPromptNotFound;

  /// sessionErrorEffortUnsupported
  ///
  /// In en, this message translates to:
  /// **'{model} does not take the effort level {level}.'**
  String sessionErrorEffortUnsupported(String model, String level);

  /// The status chip of the bar: connected, nothing running
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get sessionStandingConnected;

  /// The status chip of the bar: the socket is not ready
  ///
  /// In en, this message translates to:
  /// **'Reconnecting'**
  String get sessionStandingReconnecting;

  /// The status chip of the bar: a turn is running
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get sessionStandingRunning;

  /// The status chip of the bar: a question waits on the person
  ///
  /// In en, this message translates to:
  /// **'Waiting for you'**
  String get sessionStandingWaiting;

  /// The status chip of the bar: the session ended
  ///
  /// In en, this message translates to:
  /// **'Ended'**
  String get sessionStandingEnded;

  /// What a screen reader says of the status chip
  ///
  /// In en, this message translates to:
  /// **'Status: {standing}. Open the details of the session'**
  String sessionStandingOpen(String standing);

  /// How the session stands, in full
  ///
  /// In en, this message translates to:
  /// **'Connected — nothing running'**
  String get sessionDotConnected;

  /// How the session stands, in full
  ///
  /// In en, this message translates to:
  /// **'Reconnecting…'**
  String get sessionDotReconnecting;

  /// How the session stands, in full
  ///
  /// In en, this message translates to:
  /// **'Claude is working'**
  String get sessionDotRunning;

  /// How the session stands, in full: a question waits
  ///
  /// In en, this message translates to:
  /// **'Claude is waiting for your answer'**
  String get sessionDotWaiting;

  /// How the session stands, in full
  ///
  /// In en, this message translates to:
  /// **'The session ended'**
  String get sessionDotEnded;

  /// Which session it is
  ///
  /// In en, this message translates to:
  /// **'Session {sessionId}'**
  String sessionDotSession(String sessionId);

  /// Title of the sheet the status chip opens
  ///
  /// In en, this message translates to:
  /// **'The session'**
  String get sessionStatusTitle;

  /// What the status sheet is for
  ///
  /// In en, this message translates to:
  /// **'How it stands, which session it is, and what it has cost since it opened.'**
  String get sessionStatusDescription;

  /// What the session cost so far
  ///
  /// In en, this message translates to:
  /// **'This session has cost {cost} since it opened, over {turns} turn(s)'**
  String sessionStatusCost(String cost, String turns);

  /// The status sheet before the first turn ended
  ///
  /// In en, this message translates to:
  /// **'No turn has ended yet, so there is no cost to say.'**
  String get sessionStatusNoCost;

  /// Tooltip of the ⋯ of the bar
  ///
  /// In en, this message translates to:
  /// **'More actions of the session'**
  String get sessionMenuOpen;

  /// Item of the menu of the session
  ///
  /// In en, this message translates to:
  /// **'Permission rules'**
  String get sessionMenuRules;

  /// Item of the menu of the session
  ///
  /// In en, this message translates to:
  /// **'Undo file changes…'**
  String get sessionMenuUndo;

  /// Item of the menu of the session
  ///
  /// In en, this message translates to:
  /// **'Copy the session id'**
  String get sessionMenuCopyId;

  /// Said once the id is on the clipboard
  ///
  /// In en, this message translates to:
  /// **'The session id was copied.'**
  String get sessionMenuCopied;

  /// Said when the clipboard refused the id
  ///
  /// In en, this message translates to:
  /// **'The id could not be copied. Select it and copy it by hand: {sessionId}'**
  String sessionMenuCopyFailed(String sessionId);

  /// Item of the menu of the session
  ///
  /// In en, this message translates to:
  /// **'Help about this screen'**
  String get sessionMenuHelp;

  /// Item of the menu of the session
  ///
  /// In en, this message translates to:
  /// **'End session'**
  String get sessionMenuEnd;

  /// Why ending the session is not offered
  ///
  /// In en, this message translates to:
  /// **'Only the app that opened this session can end it.'**
  String get sessionMenuEndNotOwner;

  /// Why ending the session is not offered
  ///
  /// In en, this message translates to:
  /// **'The session has already ended.'**
  String get sessionMenuEndEnded;

  /// Title of the dialog that confirms ending the session
  ///
  /// In en, this message translates to:
  /// **'End this session?'**
  String get sessionCloseTitle;

  /// What ending the session loses
  ///
  /// In en, this message translates to:
  /// **'Claude stops on this machine. What it wrote stays on disk, but the undo of its file changes goes with the session. The conversation stays in the history, and can be resumed.'**
  String get sessionCloseDescription;

  /// Backs out of ending the session
  ///
  /// In en, this message translates to:
  /// **'Keep it running'**
  String get sessionCloseKeep;

  /// Confirms ending the session
  ///
  /// In en, this message translates to:
  /// **'End the session'**
  String get sessionCloseConfirm;

  /// Tooltip of the history of the bar
  ///
  /// In en, this message translates to:
  /// **'Conversations of this folder'**
  String get sessionHistoryOpen;

  /// Why the history of the bar is off
  ///
  /// In en, this message translates to:
  /// **'The folder of this session is not known yet'**
  String get sessionHistoryUnknown;

  /// Title of the help of the session screen
  ///
  /// In en, this message translates to:
  /// **'The session screen'**
  String get sessionHelpTitle;

  /// Help: what the screen is
  ///
  /// In en, this message translates to:
  /// **'Only the conversation scrolls. The box stays at the bottom, over the keyboard, with what holds for the next prompt under it; what the session is doing is said in the conversation itself, in the order it happened.'**
  String get sessionHelpIntro;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'The bar under the box'**
  String get sessionHelpBarHeading;

  /// Help: the bar of the box
  ///
  /// In en, this message translates to:
  /// **'In this order: / lists the commands and skills; then the mode, the model, the effort and the share of the context window used — with Compact inside it — and send. While Claude works, send puts what you wrote in the queue, and Stop stands beside it; with the box empty, the button itself is Stop. The effort is chosen in a new conversation only. On a narrow screen, the model, the effort and the context move into the … of the bar.'**
  String get sessionHelpBar;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'The menu of the session'**
  String get sessionHelpMenuHeading;

  /// Help: the menu
  ///
  /// In en, this message translates to:
  /// **'The … of the top bar holds what is done to the whole session, and seldom: end it — only the app that opened it may, and it asks first —, undo its file changes, copy its id; and the permission rules and this help. The clock beside it opens the conversations of this folder.'**
  String get sessionHelpMenu;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'The status'**
  String get sessionHelpStatusHeading;

  /// Help: the status chip
  ///
  /// In en, this message translates to:
  /// **'The chip of the top bar says how the session stands, by colour and by word: connected, reconnecting, running, waiting for you, or ended. Tap it for the id of the session, with the way to copy it, and what it has cost since it opened.'**
  String get sessionHelpStatus;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'While Claude works'**
  String get sessionHelpWorkingHeading;

  /// Help: the working indicator
  ///
  /// In en, this message translates to:
  /// **'While a turn runs, its last line moves: an asterisk, what Claude is doing — the tool it runs, that it waits for you, or a word for the turn — and for how long. Its thinking is a line of its own, in order: \"Thinking…\" while it arrives, \"Thought for n s\" once it is over — what it thought in view, quieter than the answer, when the model showed it; folded when it did not. A tool is one line, folded: tap it for what went in and what came out. When the turn ends, the line gives way to what the turn cost.'**
  String get sessionHelpWorking;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'Questions in the conversation'**
  String get sessionHelpInlineHeading;

  /// Help: the inline question
  ///
  /// In en, this message translates to:
  /// **'When Claude asks before running a tool, the question is in the conversation, in the place of that tool: the exact command, how risky it is, the time left and how far a yes reaches. Once answered, the tool line says how — by you, in the browser, by one of your rules, or refused because nobody answered in time. A question never closes the keyboard nor takes the box from you: send still sends your prompt, and only a tap on the card answers it.'**
  String get sessionHelpInline;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'Waiting for your answer'**
  String get sessionHelpPillHeading;

  /// Help: the pending pill
  ///
  /// In en, this message translates to:
  /// **'With a question out of view — the conversation scrolled up — a pill over the box says Claude is waiting, and how many questions. Tapping it takes you to the oldest.'**
  String get sessionHelpPill;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'The task list'**
  String get sessionHelpTasksHeading;

  /// Help: the task strip
  ///
  /// In en, this message translates to:
  /// **'When Claude keeps a task list, it stands over the box, folded into one line — how many are done and what is being done now. Tap it for the whole list; it changes as Claude works, without moving what you are reading.'**
  String get sessionHelpTasks;

  /// Help heading
  ///
  /// In en, this message translates to:
  /// **'From a prompt'**
  String get sessionHelpActionsHeading;

  /// Help: the actions of a message
  ///
  /// In en, this message translates to:
  /// **'Press and hold a prompt of yours for what can be done from it: edit it and send it again, fork from before it, and put the files back to before its turn — with the reach shown file by file first. A screen reader offers the same three as actions of the message. While Claude works the undo waits for the turn to end; once the session has ended there is no undo.'**
  String get sessionHelpActions;

  /// What a screen reader says of the plan card
  ///
  /// In en, this message translates to:
  /// **'The plan Claude proposes'**
  String get permissionPlanLabel;

  /// Title of the plan card
  ///
  /// In en, this message translates to:
  /// **'Approve the plan?'**
  String get permissionPlanTitle;

  /// What the modes of the plan card are for
  ///
  /// In en, this message translates to:
  /// **'Once approved, go on'**
  String get permissionPlanModeLegend;

  /// Approves the plan
  ///
  /// In en, this message translates to:
  /// **'Approve the plan'**
  String get permissionPlanApprove;

  /// Label of what to change in the plan
  ///
  /// In en, this message translates to:
  /// **'Or say what to change, and keep planning'**
  String get permissionPlanCommentLabel;

  /// Sends the plan back
  ///
  /// In en, this message translates to:
  /// **'Keep planning'**
  String get permissionPlanKeepPlanning;

  /// The mode an approved plan goes on in
  ///
  /// In en, this message translates to:
  /// **'asking before each edit'**
  String get permissionPlanModeDefault;

  /// The mode an approved plan goes on in
  ///
  /// In en, this message translates to:
  /// **'accepting edits without asking'**
  String get permissionPlanModeAcceptEdits;

  /// The working indicator: a question waits
  ///
  /// In en, this message translates to:
  /// **'Waiting for your answer'**
  String get sessionWorkingWaiting;

  /// The working indicator: a tool runs
  ///
  /// In en, this message translates to:
  /// **'Running {tool}…'**
  String sessionWorkingRunningTool(String tool);

  /// How long the turn has run
  ///
  /// In en, this message translates to:
  /// **'{seconds} s'**
  String sessionWorkingSeconds(String seconds);

  /// How long the turn has run
  ///
  /// In en, this message translates to:
  /// **'{minutes} min {seconds} s'**
  String sessionWorkingMinutes(String minutes, String seconds);

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Pondering…'**
  String get sessionWorkingVerbPondering;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Deciphering…'**
  String get sessionWorkingVerbDeciphering;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Mulling it over…'**
  String get sessionWorkingVerbMulling;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Reasoning…'**
  String get sessionWorkingVerbReasoning;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Weighing the options…'**
  String get sessionWorkingVerbWeighing;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Sketching…'**
  String get sessionWorkingVerbSketching;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Untangling…'**
  String get sessionWorkingVerbUntangling;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Assembling…'**
  String get sessionWorkingVerbAssembling;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Tinkering…'**
  String get sessionWorkingVerbTinkering;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Exploring…'**
  String get sessionWorkingVerbExploring;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Connecting the dots…'**
  String get sessionWorkingVerbConnecting;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Distilling…'**
  String get sessionWorkingVerbDistilling;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Brewing…'**
  String get sessionWorkingVerbBrewing;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Crafting…'**
  String get sessionWorkingVerbCrafting;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Investigating…'**
  String get sessionWorkingVerbInvestigating;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Puzzling it out…'**
  String get sessionWorkingVerbPuzzling;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Considering…'**
  String get sessionWorkingVerbConsidering;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Computing…'**
  String get sessionWorkingVerbComputing;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Working…'**
  String get sessionWorkingVerbWorking;

  /// A verb of the working indicator
  ///
  /// In en, this message translates to:
  /// **'Musing…'**
  String get sessionWorkingVerbMusing;

  /// The pill over the box with a question out of view
  ///
  /// In en, this message translates to:
  /// **'Claude is waiting for your answer ({count})'**
  String sessionPendingPill(String count);

  /// The questions at the tail, whose tool is not a line yet
  ///
  /// In en, this message translates to:
  /// **'Questions waiting for you'**
  String get sessionInlineTail;

  /// What a screen reader says of the task strip
  ///
  /// In en, this message translates to:
  /// **'The task list Claude keeps for this conversation'**
  String get sessionTasksLabel;

  /// The task strip, folded
  ///
  /// In en, this message translates to:
  /// **'{done}/{total} · {task}'**
  String sessionTasksHeadline(String done, String total, String task);

  /// The task strip, folded, with every task done
  ///
  /// In en, this message translates to:
  /// **'{done}/{total} · All done'**
  String sessionTasksAllDone(String done, String total);

  /// The state of a task
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get sessionTaskPending;

  /// The state of a task
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get sessionTaskInProgress;

  /// The state of a task
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get sessionTaskCompleted;

  /// The line an undo leaves in the conversation
  ///
  /// In en, this message translates to:
  /// **'Files put back: {restored} back, {kept} kept as they were'**
  String sessionRewoundSummary(String restored, String kept);

  /// The line an undo that could not put every file back leaves
  ///
  /// In en, this message translates to:
  /// **'Files put back: {restored} back, {kept} kept as they were, {failed} could not go back'**
  String sessionRewoundFailed(String restored, String kept, String failed);

  /// The line of a replay that could not bring everything
  ///
  /// In en, this message translates to:
  /// **'This is only what the server still had in memory, not the whole conversation.'**
  String get sessionReplayPartial;

  /// Title of the actions of a prompt
  ///
  /// In en, this message translates to:
  /// **'What to do with this prompt'**
  String get sessionMessageActions;

  /// An action of a prompt
  ///
  /// In en, this message translates to:
  /// **'Edit and send again'**
  String get sessionMessageEdit;

  /// An action of a prompt
  ///
  /// In en, this message translates to:
  /// **'Fork from here — send it again, unchanged, in a new conversation'**
  String get sessionMessageForkFrom;

  /// An action of a prompt
  ///
  /// In en, this message translates to:
  /// **'Put the files back to before this prompt'**
  String get sessionMessageUndo;

  /// An action of a prompt, off while a turn runs
  ///
  /// In en, this message translates to:
  /// **'Put the files back to before this prompt — not while Claude is working'**
  String get sessionMessageUndoBusy;

  /// Hint a screen reader gives on a prompt
  ///
  /// In en, this message translates to:
  /// **'Press and hold for what to do with this prompt'**
  String get sessionMessageHold;

  /// The strip over the box while a prompt is edited
  ///
  /// In en, this message translates to:
  /// **'Editing a message'**
  String get sessionEditEditing;

  /// Leaves the edit
  ///
  /// In en, this message translates to:
  /// **'Stop editing'**
  String get sessionEditCancel;

  /// What sending an edited prompt does
  ///
  /// In en, this message translates to:
  /// **'You are editing a prompt: sending it starts a new conversation from before it. The original conversation stays as it was.'**
  String get sessionEditExplain;

  /// What is offered when the CLI refused the point of a fork
  ///
  /// In en, this message translates to:
  /// **'Resume the conversation instead'**
  String get sessionEditResumeInstead;

  /// Said while a fork opens
  ///
  /// In en, this message translates to:
  /// **'Opening the new conversation…'**
  String get sessionForkStarting;

  /// Translation of session.error.forkRejected
  ///
  /// In en, this message translates to:
  /// **'Claude could not continue the conversation from that message. Resume the conversation instead, and edit from there.'**
  String get sessionErrorForkRejected;

  /// Translation of session.error.forkPointUnknown
  ///
  /// In en, this message translates to:
  /// **'That message is not a prompt of this conversation. Reload the conversation and try again.'**
  String get sessionErrorForkPointUnknown;

  /// Title of the address screen
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get connectionTitle;

  /// What the address screen is for
  ///
  /// In en, this message translates to:
  /// **'Choose how this phone reaches your server: the address on your network, the one on the internet, or another one. The API, the live connection and the login all go through it.'**
  String get connectionDescription;

  /// Radio: the address on the local network
  ///
  /// In en, this message translates to:
  /// **'Internal'**
  String get connectionInternal;

  /// What the internal address is
  ///
  /// In en, this message translates to:
  /// **'On your local network'**
  String get connectionInternalHint;

  /// Radio: the address on the internet
  ///
  /// In en, this message translates to:
  /// **'External'**
  String get connectionExternal;

  /// What the external address is
  ///
  /// In en, this message translates to:
  /// **'Over the internet'**
  String get connectionExternalHint;

  /// Radio: an address typed by the person
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get connectionOther;

  /// Label of the field of the other address
  ///
  /// In en, this message translates to:
  /// **'Address of the server'**
  String get connectionOtherLabel;

  /// Example in the field of the other address
  ///
  /// In en, this message translates to:
  /// **'https://my-server.example'**
  String get connectionOtherHint;

  /// Why a radio is off
  ///
  /// In en, this message translates to:
  /// **'This version of the app was built without this address.'**
  String get connectionUndefined;

  /// The address the app talks through now
  ///
  /// In en, this message translates to:
  /// **'In use: {origin}'**
  String connectionInUse(String origin);

  /// Said when no address can be used
  ///
  /// In en, this message translates to:
  /// **'There is no address to reach the server through yet: choose one to sign in.'**
  String get connectionNone;

  /// Said when the saved choice no longer exists
  ///
  /// In en, this message translates to:
  /// **'The address saved before is not offered by this version of the app, so the default is in use.'**
  String get connectionNoticeUnavailable;

  /// Tests the address
  ///
  /// In en, this message translates to:
  /// **'Test the connection'**
  String get connectionTest;

  /// While the address is tested
  ///
  /// In en, this message translates to:
  /// **'Testing…'**
  String get connectionTesting;

  /// The test passed
  ///
  /// In en, this message translates to:
  /// **'The server and its login answered at {origin}.'**
  String connectionResultOk(String origin);

  /// The test found no server
  ///
  /// In en, this message translates to:
  /// **'Nothing answered at {origin}: the server is down, not reachable from this network, or this is not its address.'**
  String connectionResultServerUnreachable(String origin);

  /// The test found no login
  ///
  /// In en, this message translates to:
  /// **'The server answered at {origin}, but its login did not.'**
  String connectionResultLoginUnavailable(String origin);

  /// Saves the address
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get connectionSave;

  /// Title of the confirmation of a change of address
  ///
  /// In en, this message translates to:
  /// **'Change the address?'**
  String get connectionSwitchTitle;

  /// What changing the address does
  ///
  /// In en, this message translates to:
  /// **'Changing the address ends your login: the next one is with the server at the new address.'**
  String get connectionSwitchBody;

  /// Confirms the change of address
  ///
  /// In en, this message translates to:
  /// **'Change and sign out'**
  String get connectionSwitchConfirm;

  /// Backs out of the change of address
  ///
  /// In en, this message translates to:
  /// **'Keep this address'**
  String get connectionSwitchCancel;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Write the address of the server.'**
  String get connectionProblemEmpty;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'This is not an address: start it with https://'**
  String get connectionProblemNotAnAddress;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Only https:// addresses are accepted.'**
  String get connectionProblemScheme;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Only https:// is accepted here: http:// is for this phone itself (localhost) and, in the development app, for an IP of the local network (10.x, 172.16–31.x, 192.168.x), because the login would travel in clear text.'**
  String get connectionProblemPlainText;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Only the address of the server: nothing after the /.'**
  String get connectionProblemPath;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Only the address of the server: no ? after it.'**
  String get connectionProblemQuery;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'Only the address of the server: no # after it.'**
  String get connectionProblemFragment;

  /// Why the address cannot be saved
  ///
  /// In en, this message translates to:
  /// **'The address must not carry a user or a password.'**
  String get connectionProblemUserInfo;

  /// Tooltip of the help of the address screen
  ///
  /// In en, this message translates to:
  /// **'Help about the server address'**
  String get connectionHelpOpen;

  /// Help of the address screen
  ///
  /// In en, this message translates to:
  /// **'The app reaches your server through one address, and everything goes through it: the API, the live connection and the login. Internal is the address on your network; external is the one on the internet, when your server is exposed; other is any address you type. Only https:// is accepted, except for localhost. Test the connection before saving: it asks the server and its login, and says which one did not answer. Your choice stays on this phone through restarts and sign-outs. Changing it ends your login, because the next one is with the server at the new address. This screen opens without signing in, from the sign-in screen, so a wrong address never locks you out.'**
  String get connectionHelpBody;

  /// Title of the folders home
  ///
  /// In en, this message translates to:
  /// **'Folders'**
  String get foldersTitle;

  /// Section of the open folders
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get foldersOpenSection;

  /// Section of the recent folders
  ///
  /// In en, this message translates to:
  /// **'Recent'**
  String get foldersRecentSection;

  /// Opens the folder picker
  ///
  /// In en, this message translates to:
  /// **'Open another folder'**
  String get foldersOpenAnother;

  /// Empty state of the open folders
  ///
  /// In en, this message translates to:
  /// **'No folder open'**
  String get foldersNoneOpenTitle;

  /// Empty state of the open folders
  ///
  /// In en, this message translates to:
  /// **'Open a folder to start a session in it. The folders open here are the same as the tabs in the browser.'**
  String get foldersNoneOpenBody;

  /// Empty recent list
  ///
  /// In en, this message translates to:
  /// **'No other folder opened before.'**
  String get foldersNoRecent;

  /// Loading the folders home
  ///
  /// In en, this message translates to:
  /// **'Reading your folders…'**
  String get foldersLoading;

  /// Why an open folder cannot be used
  ///
  /// In en, this message translates to:
  /// **'This folder is no longer on the computer.'**
  String get foldersMissing;

  /// Why an open folder cannot be used
  ///
  /// In en, this message translates to:
  /// **'This folder is no longer inside a root you may use.'**
  String get foldersNotAllowed;

  /// How many live sessions a folder has
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No session open} =1{1 session open} other{{count} sessions open}}'**
  String foldersSessions(int count);

  /// How many questions wait in a folder
  ///
  /// In en, this message translates to:
  /// **'{count} waiting for you'**
  String foldersPending(int count);

  /// A folder whose count failed
  ///
  /// In en, this message translates to:
  /// **'The sessions of this folder could not be read.'**
  String get foldersLoadFailed;

  /// Label of the row menu
  ///
  /// In en, this message translates to:
  /// **'Actions for {name}'**
  String foldersActions(String name);

  /// Row action
  ///
  /// In en, this message translates to:
  /// **'Close folder'**
  String get foldersClose;

  /// Confirmation after closing a folder
  ///
  /// In en, this message translates to:
  /// **'Folder closed. No session was ended.'**
  String get foldersClosed;

  /// Row action
  ///
  /// In en, this message translates to:
  /// **'Pin'**
  String get foldersPin;

  /// Row action
  ///
  /// In en, this message translates to:
  /// **'Unpin'**
  String get foldersUnpin;

  /// Row action
  ///
  /// In en, this message translates to:
  /// **'Remove from recent'**
  String get foldersForget;

  /// Refusal past the ceiling of open folders
  ///
  /// In en, this message translates to:
  /// **'You already have {limit} folders open. Close one to open another.'**
  String foldersLimitReached(String limit);

  /// Tooltip of the help button
  ///
  /// In en, this message translates to:
  /// **'Help about folders'**
  String get foldersHelpOpen;

  /// Help of the folders home
  ///
  /// In en, this message translates to:
  /// **'Open: the folders you are working in — the same as the folder tabs in the browser. Each one says how many sessions are open in it and how many questions wait for you. Tap one to see its sessions and its history, or to start a new session.\n\nRecent: folders you opened before. Tap one to open it again; pin the ones you come back to.\n\nOpen another folder: walk the roots this computer lets Claude run in, one level at a time, and open the folder you want.\n\nClosing a folder only takes it off the list: the sessions in it keep running.'**
  String get foldersHelpBody;

  /// Title of the folder picker
  ///
  /// In en, this message translates to:
  /// **'Open a folder'**
  String get folderPickerTitle;

  /// Heading of the roots level
  ///
  /// In en, this message translates to:
  /// **'The roots this computer lets Claude run in'**
  String get folderPickerRoots;

  /// Opens the folder being browsed
  ///
  /// In en, this message translates to:
  /// **'Open this folder'**
  String get folderPickerOpenThis;

  /// Goes to the parent folder
  ///
  /// In en, this message translates to:
  /// **'Up one level'**
  String get folderPickerUp;

  /// Empty listing
  ///
  /// In en, this message translates to:
  /// **'No subfolder here.'**
  String get folderPickerEmpty;

  /// Listing cut by the ceiling
  ///
  /// In en, this message translates to:
  /// **'There are too many folders here: only the first ones are listed.'**
  String get folderPickerTruncated;

  /// Loading a listing
  ///
  /// In en, this message translates to:
  /// **'Reading the folder…'**
  String get folderPickerLoading;

  /// Starts a draft in the folder
  ///
  /// In en, this message translates to:
  /// **'New session'**
  String get folderNewSession;

  /// Section of live sessions
  ///
  /// In en, this message translates to:
  /// **'Open sessions'**
  String get folderOpenSessions;

  /// Empty live sessions
  ///
  /// In en, this message translates to:
  /// **'No session open in this folder'**
  String get folderNoOpenSessions;

  /// Empty live sessions
  ///
  /// In en, this message translates to:
  /// **'Start one with New session, or open one from the history below.'**
  String get folderNoOpenSessionsBody;

  /// Loading live sessions
  ///
  /// In en, this message translates to:
  /// **'Reading the open sessions…'**
  String get folderSessionsLoading;

  /// Section of the folder history
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get folderHistory;

  /// Opens the whole history
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get folderHistorySeeAll;

  /// Empty folder history
  ///
  /// In en, this message translates to:
  /// **'No conversation in this folder yet.'**
  String get folderHistoryEmpty;

  /// Status and model of a live session
  ///
  /// In en, this message translates to:
  /// **'{status} · {model}'**
  String folderSessionDetails(String status, String model);

  /// When a live session started
  ///
  /// In en, this message translates to:
  /// **'Started {when}'**
  String folderSessionStarted(String when);

  /// The subfolder a live session runs in
  ///
  /// In en, this message translates to:
  /// **'In {path}'**
  String folderSessionBelow(String path);

  /// Where a live session was opened
  ///
  /// In en, this message translates to:
  /// **'Opened in a browser'**
  String get folderOpenedFromWeb;

  /// Where a live session was opened
  ///
  /// In en, this message translates to:
  /// **'Opened on a phone'**
  String get folderOpenedFromMobile;

  /// Tooltip of the help button
  ///
  /// In en, this message translates to:
  /// **'Help about this folder'**
  String get folderHelpOpen;

  /// Help of the folder screen
  ///
  /// In en, this message translates to:
  /// **'New session: a draft in this folder. Nothing runs until you send the first prompt.\n\nOpen sessions: what runs in this folder and below it right now, opened here, on another phone or in a browser. Tap one to follow it; it joins the sessions panel of this folder.\n\nHistory: the conversations Claude kept for this folder. Open one to read it or to continue it.'**
  String get folderHelpBody;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Starting'**
  String get liveStatusStarting;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Idle'**
  String get liveStatusIdle;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Thinking'**
  String get liveStatusThinking;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Running a tool'**
  String get liveStatusRunning;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Waiting for you'**
  String get liveStatusWaiting;

  /// Status of a live session
  ///
  /// In en, this message translates to:
  /// **'Ended'**
  String get liveStatusClosed;

  /// A status this build does not know
  ///
  /// In en, this message translates to:
  /// **'Unknown status'**
  String get liveStatusUnknown;

  /// Opens the side panel of the folder's sessions
  ///
  /// In en, this message translates to:
  /// **'Sessions of this folder'**
  String get folderPanelOpen;

  /// Title of the side panel
  ///
  /// In en, this message translates to:
  /// **'Sessions of {folder}'**
  String folderPanelTitle(String folder);

  /// Goes to the folder screen
  ///
  /// In en, this message translates to:
  /// **'All sessions of the folder'**
  String get folderPanelAll;

  /// Marks the session on screen
  ///
  /// In en, this message translates to:
  /// **'On screen'**
  String get folderPanelCurrent;

  /// Badge of the folder icon
  ///
  /// In en, this message translates to:
  /// **'Another session of this folder is waiting for you'**
  String get folderPanelWaitingElsewhere;

  /// Detaches a session from the app
  ///
  /// In en, this message translates to:
  /// **'Close in the app'**
  String get sessionCloseInApp;

  /// What closing in the app means
  ///
  /// In en, this message translates to:
  /// **'It keeps running; it only leaves this list. Open it again from the folder.'**
  String get sessionCloseInAppNote;

  /// The folder is gone
  ///
  /// In en, this message translates to:
  /// **'That folder is no longer there.'**
  String get workspaceErrorNotFound;

  /// A file where a folder was asked
  ///
  /// In en, this message translates to:
  /// **'That is a file, not a folder.'**
  String get workspaceErrorNotADirectory;

  /// The backend may not read the folder
  ///
  /// In en, this message translates to:
  /// **'This computer cannot read {path}.'**
  String workspaceErrorDirectoryUnreadable(String path);

  /// Why New session is off
  ///
  /// In en, this message translates to:
  /// **'Waiting for the connection to start a session.'**
  String get folderNewSessionOffline;

  /// The server answered FILE_NOT_FOUND
  ///
  /// In en, this message translates to:
  /// **'{path} is not in the folder any more.'**
  String filesErrorNotFound(String path);

  /// The server refused the path itself
  ///
  /// In en, this message translates to:
  /// **'That is not a usable path inside the open folder.'**
  String get filesErrorInvalidPath;

  /// The server answered FILE_NOT_A_FILE
  ///
  /// In en, this message translates to:
  /// **'{path} is not a file.'**
  String filesErrorNotAFile(String path);

  /// The server answered RANGE_NOT_SATISFIABLE
  ///
  /// In en, this message translates to:
  /// **'That part of {path} is past its end — the file changed, or is shorter.'**
  String filesErrorRangeNotSatisfiable(String path);

  /// The server answered FILE_TOO_LARGE; limit is already formatted
  ///
  /// In en, this message translates to:
  /// **'{path} is too large to open on the phone ({limit} at most).'**
  String filesErrorTooLarge(String path, String limit);

  /// The server answered FILE_NOT_TEXT
  ///
  /// In en, this message translates to:
  /// **'{path} is not text the phone can show.'**
  String filesErrorNotText(String path);

  /// The server answered FILE_ACCESS_DENIED
  ///
  /// In en, this message translates to:
  /// **'This machine does not let remote-claude read {path}. Check its permissions.'**
  String filesErrorAccessDenied(String path);

  /// Tooltip of the bar button that opens the files panel
  ///
  /// In en, this message translates to:
  /// **'Files of the folder'**
  String get filesPanelOpen;

  /// Heading of the files panel
  ///
  /// In en, this message translates to:
  /// **'Files'**
  String get filesPanelTitle;

  /// Tooltip of the ⋮ menu of the files panel
  ///
  /// In en, this message translates to:
  /// **'File options'**
  String get filesPanelMenu;

  /// Menu item that shows .git and the other hidden names
  ///
  /// In en, this message translates to:
  /// **'Show hidden files'**
  String get filesPanelShowHidden;

  /// Menu item that reads the level again
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get filesPanelRefresh;

  /// What the '..' row says to a screen reader
  ///
  /// In en, this message translates to:
  /// **'Up one level'**
  String get filesPanelUp;

  /// A level with nothing to show
  ///
  /// In en, this message translates to:
  /// **'This folder is empty.'**
  String get filesPanelEmpty;

  /// The level is being read
  ///
  /// In en, this message translates to:
  /// **'Reading the folder…'**
  String get filesPanelLoading;

  /// The server listed only part of the level
  ///
  /// In en, this message translates to:
  /// **'Showing the first {count} items of this folder.'**
  String filesPanelTruncated(String count);

  /// Why a link outside the folder does not open
  ///
  /// In en, this message translates to:
  /// **'A link that leads outside the open folder. It is never opened from here.'**
  String get filesPanelOutsideLink;

  /// Why a broken link does not open
  ///
  /// In en, this message translates to:
  /// **'A broken link: what it leads to is not there.'**
  String get filesPanelBrokenLink;

  /// Why an entry whose name is not UTF-8 does not open
  ///
  /// In en, this message translates to:
  /// **'Its name cannot be read, so it is not opened from here.'**
  String get filesPanelUnreadableName;

  /// Why a FIFO, socket or device does not open
  ///
  /// In en, this message translates to:
  /// **'This is not a file that can be opened.'**
  String get filesPanelNotAFile;

  /// The device is still pending: what to do
  ///
  /// In en, this message translates to:
  /// **'Approve this phone in the browser to read the folder\'s files, then refresh.'**
  String get filesPanelDevicePending;

  /// The device was revoked
  ///
  /// In en, this message translates to:
  /// **'This phone was revoked, so it no longer reads the folder\'s files.'**
  String get filesPanelDeviceRevoked;

  /// The level is gone: back to the root
  ///
  /// In en, this message translates to:
  /// **'Back to the folder'**
  String get filesPanelBackToRoot;

  /// Copies the path relative to the folder
  ///
  /// In en, this message translates to:
  /// **'Copy path'**
  String get filesEntryCopyPath;

  /// Said once the path is on the clipboard
  ///
  /// In en, this message translates to:
  /// **'Path copied'**
  String get filesEntryPathCopied;

  /// Tooltip of the ⋯ of the viewer
  ///
  /// In en, this message translates to:
  /// **'File options'**
  String get fileViewerMenu;

  /// Menu item that wraps long lines, for every file
  ///
  /// In en, this message translates to:
  /// **'Word wrap'**
  String get fileViewerWrap;

  /// Copies the whole file
  ///
  /// In en, this message translates to:
  /// **'Copy all'**
  String get fileViewerCopyAll;

  /// Said once the file is on the clipboard
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get fileViewerCopied;

  /// The file is being read
  ///
  /// In en, this message translates to:
  /// **'Opening the file…'**
  String get fileViewerLoading;

  /// The file is past the light-mode line
  ///
  /// In en, this message translates to:
  /// **'A large file ({size}): it may take a moment to scroll.'**
  String fileViewerLarge(String size);

  /// A file of zero bytes
  ///
  /// In en, this message translates to:
  /// **'This file is empty.'**
  String get fileViewerEmpty;

  /// A read brought another version
  ///
  /// In en, this message translates to:
  /// **'The file changed on disk — this is the new version.'**
  String get fileViewerChanged;

  /// A line cut with the wrap off
  ///
  /// In en, this message translates to:
  /// **'… {count} more characters — turn on word wrap to read the whole line'**
  String fileViewerLineCut(String count);

  /// A binary, or a type the phone does not show
  ///
  /// In en, this message translates to:
  /// **'This file has no preview on the phone.'**
  String get fileViewerNoPreview;

  /// FILE_NOT_TEXT for an encoding
  ///
  /// In en, this message translates to:
  /// **'The encoding of this file was not recognized, so it is not shown.'**
  String get fileViewerEncoding;

  /// FILE_TOO_LARGE
  ///
  /// In en, this message translates to:
  /// **'This file is too large to open on the phone ({size}).'**
  String fileViewerTooLarge(String size);

  /// FILE_NOT_FOUND
  ///
  /// In en, this message translates to:
  /// **'This file is not in the folder any more.'**
  String get fileViewerNotFound;

  /// FILE_ACCESS_DENIED and the folder refusals
  ///
  /// In en, this message translates to:
  /// **'Access to this file was denied.'**
  String get fileViewerDenied;

  /// Leaves the viewer of a file that is gone
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get fileViewerBack;

  /// A question waits in the session the viewer was opened from
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Claude is waiting for your answer} other{Claude is waiting for {count} answers}}'**
  String fileViewerClaudeWaiting(int count);

  /// Goes to the card of the question
  ///
  /// In en, this message translates to:
  /// **'Back to the session'**
  String get fileViewerBackToSession;

  /// What a screen reader says of an image of the folder
  ///
  /// In en, this message translates to:
  /// **'Image {name}'**
  String fileViewerImage(String name);

  /// Switches a markdown file back to its preview
  ///
  /// In en, this message translates to:
  /// **'Show the preview'**
  String get markdownPreview;

  /// Switches a markdown file to its source
  ///
  /// In en, this message translates to:
  /// **'Show the source'**
  String get markdownSource;

  /// A remote image is never loaded; its name and address stand in its place
  ///
  /// In en, this message translates to:
  /// **'Remote image, not loaded: {name}'**
  String markdownRemoteImage(String name);

  /// A relative link that climbs out of the folder
  ///
  /// In en, this message translates to:
  /// **'That link leads outside the open folder, so it is not opened.'**
  String get markdownLinkOutside;

  /// Asked before an http, https or mailto link leaves the app
  ///
  /// In en, this message translates to:
  /// **'Open this address outside the app?'**
  String get markdownLinkConfirm;

  /// Confirms leaving the app for the address
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get markdownLinkOpen;

  /// A javascript:, file:, data: or unknown link
  ///
  /// In en, this message translates to:
  /// **'This kind of link is not opened from here.'**
  String get markdownLinkRefused;

  /// What a drawn Mermaid diagram is called
  ///
  /// In en, this message translates to:
  /// **'Diagram'**
  String get diagramLabel;

  /// A diagram is being drawn
  ///
  /// In en, this message translates to:
  /// **'Drawing the diagram…'**
  String get diagramDrawing;

  /// Mermaid refused the code, saying the line
  ///
  /// In en, this message translates to:
  /// **'This diagram has an error on line {line}, so it is shown as code.'**
  String diagramInvalidLine(int line);

  /// Mermaid refused the code
  ///
  /// In en, this message translates to:
  /// **'This diagram has an error, so it is shown as code.'**
  String get diagramInvalid;

  /// The code is past the ceiling
  ///
  /// In en, this message translates to:
  /// **'This diagram is too large to draw — {size} characters, past the limit of {limit} — so it is shown as code.'**
  String diagramTooLarge(String size, String limit);

  /// The engine took too long, or did not start
  ///
  /// In en, this message translates to:
  /// **'The diagram could not be drawn, so it is shown as code.'**
  String get diagramUnavailable;

  /// Where in the PDF the person is
  ///
  /// In en, this message translates to:
  /// **'Page {page} of {count}'**
  String pdfPageOf(int page, int count);

  /// Opens the question of a page number, and goes there
  ///
  /// In en, this message translates to:
  /// **'Go to page'**
  String get pdfGoTo;

  /// The page typed is not one of the document
  ///
  /// In en, this message translates to:
  /// **'Type a page from 1 to {count}.'**
  String pdfGoToInvalid(int count);

  /// Heading of the sheet that asks for the password
  ///
  /// In en, this message translates to:
  /// **'This PDF is protected by a password'**
  String get pdfPasswordTitle;

  /// The field of the password of a PDF
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get pdfPasswordField;

  /// The password typed is not the document's
  ///
  /// In en, this message translates to:
  /// **'That password does not open this PDF. Try again.'**
  String get pdfPasswordWrong;

  /// Opens the PDF with the password typed
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get pdfUnlock;

  /// The sheet of the password was cancelled
  ///
  /// In en, this message translates to:
  /// **'This PDF is protected by a password.'**
  String get pdfProtected;

  /// Opens the sheet of the password again
  ///
  /// In en, this message translates to:
  /// **'Enter the password'**
  String get pdfEnterPassword;

  /// PDFium refused the bytes
  ///
  /// In en, this message translates to:
  /// **'This PDF could not be read — it may be damaged.'**
  String get pdfCorrupt;

  /// Downloads a file of the folder to where the person chooses
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get filesDownload;

  /// A download on its way, in the strip
  ///
  /// In en, this message translates to:
  /// **'Downloading {name}'**
  String filesDownloading(String name);

  /// Stops a download on its way
  ///
  /// In en, this message translates to:
  /// **'Cancel the download'**
  String get filesDownloadCancel;

  /// The file was saved where the person chose
  ///
  /// In en, this message translates to:
  /// **'{name} downloaded.'**
  String filesDownloaded(String name);

  /// The file is larger than the server sends; limit is already formatted
  ///
  /// In en, this message translates to:
  /// **'{path} passes the download limit of {limit}, so it was not downloaded.'**
  String filesDownloadTooLarge(String path, String limit);

  /// The server or the network refused the download; reason is the translated refusal
  ///
  /// In en, this message translates to:
  /// **'{name} was not downloaded. {reason}'**
  String filesDownloadRefused(String name, String reason);

  /// The bytes arrived, and the system refused to save them there
  ///
  /// In en, this message translates to:
  /// **'The phone could not save {name} where you chose.'**
  String filesDownloadNotSaved(String name);

  /// The server answered FILE_CHANGED: the rest of a download was asked of a version that is gone
  ///
  /// In en, this message translates to:
  /// **'{path} changed while it was coming. Try again.'**
  String filesErrorChanged(String path);
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
