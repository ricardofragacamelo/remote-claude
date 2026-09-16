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
}
