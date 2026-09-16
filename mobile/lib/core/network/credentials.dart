/// The credential, held for the transport layer.
///
/// `core/` never imports `features/` — the arrow points the other way, always — so the auth
/// feature pushes the token in here instead of the transport reaching into it. The value lives in
/// memory only; what survives a restart lives in the operating system's secure store, never in
/// `SharedPreferences`. See docs/architecture/mobile/07-auth.md.
library;

/// What the HTTP client and the socket read.
abstract interface class CredentialSource {
  /// The access token to send, or `null` while nobody is signed in.
  String? get accessToken;

  /// The language of this client, for `Accept-Language` and for the handshake.
  String get locale;

  /// Renews after a rejection. Answers the new token, or `null` when renewal failed.
  ///
  /// Implementations **must** deduplicate: refresh tokens rotate, and a provider that sees the
  /// same one used twice treats it as a leak and revokes the whole family.
  Future<String?> renew();
}

/// The one credential holder of the app.
class Credentials implements CredentialSource {
  Credentials({this.locale = 'en'});

  String? _accessToken;

  @override
  String locale;

  Future<String?> Function()? _renewer;
  Future<String?>? _inFlight;

  @override
  String? get accessToken => _accessToken;

  /// Called by the auth feature whenever the session changes.
  void setAccessToken(String? token) {
    _accessToken = token;
  }

  /// Called when the connection's language changes.
  void setLocale(String next) {
    locale = next;
  }

  /// Wires renewal in, without the transport learning what a refresh token is.
  void setRenewer(Future<String?> Function()? renewer) {
    _renewer = renewer;
  }

  /// Renews once, however many callers noticed the expiry at the same moment.
  @override
  Future<String?> renew() {
    final Future<String?> Function()? renewer = _renewer;
    if (renewer == null) {
      return Future<String?>.value(null);
    }

    return _inFlight ??= renewer().whenComplete(() {
      _inFlight = null;
    });
  }
}
