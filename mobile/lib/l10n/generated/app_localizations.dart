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
