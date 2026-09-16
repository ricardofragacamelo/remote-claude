/// The auth repository, where the OIDC package and the secure store stop existing.
///
/// Every exception from either becomes a [Failure] here. Nothing above this file knows what a
/// `PlatformException` is. See docs/architecture/mobile/01-architecture.md.
library;

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/auth/data/datasources/oidc_auth_data_source.dart';
import 'package:remote_claude/features/auth/data/mappers/id_token_claims.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';

/// How long a token is assumed to live when the provider did not say.
const Duration assumedTokenLifetime = Duration(minutes: 5);

/// [AuthRepository] over `flutter_appauth` and the operating system's secure store.
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required this._oidc,
    required this._store,
    required this._logger,
    required this._traceIds,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final OidcAuthDataSource _oidc;
  final CredentialStore _store;
  final AppLogger _logger;
  final TraceIds _traceIds;
  final DateTime Function() _now;

  @override
  Future<AuthSession> signIn() async => _complete(await _exchange(_oidc.authorize), 'signed in');

  @override
  Future<AuthSession?> restore() async {
    final String? accessToken = await _store.read(CredentialKeys.accessToken);
    final String? userId = await _store.read(CredentialKeys.userId);
    final DateTime? expiresAt = _instant(await _store.read(CredentialKeys.expiresAt));
    final DateTime? issuedAt = _instant(await _store.read(CredentialKeys.issuedAt));

    if (accessToken == null || userId == null || expiresAt == null || issuedAt == null) {
      return null;
    }

    return AuthSession(
      accessToken: accessToken,
      refreshToken: await _store.read(CredentialKeys.refreshToken),
      userId: userId,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
    );
  }

  @override
  Future<AuthSession> renew(AuthSession current) async {
    final String? refreshToken = current.refreshToken;

    if (refreshToken == null) {
      throw AuthenticationFailure(traceId: _traceIds.next());
    }

    return _complete(
      await _exchange(() => _oidc.refresh(refreshToken)),
      'credential renewed',
      fallbackUserId: current.userId,
    );
  }

  /// Stores the pair and says so. The one log line of the auth edge lives here, so a sign-in and
  /// a renewal cannot end up reporting themselves differently.
  Future<AuthSession> _complete(
    TokenResponse response,
    String message, {
    String? fallbackUserId,
  }) async {
    final AuthSession session = await _persist(response, fallbackUserId: fallbackUserId);

    _logger.info(
      message,
      op: LogOp.authToken,
      fields: <String, Object?>{
        'userId': session.userId,
        'exp': session.expiresAt.toIso8601String(),
      },
    );

    return session;
  }

  @override
  Future<void> signOut(AuthSession? current) async {
    final String? idToken = await _store.read(CredentialKeys.idToken);

    // The credential goes first. If ending the session at the provider fails, the device must
    // already be unable to act with what it was holding.
    await _store.clear();

    try {
      await _oidc.endSession(idToken);
    } on Exception catch (error) {
      // Logged and swallowed, never rethrown: the local sign-out already succeeded, and telling
      // the user it failed would invite them to try again with nothing left to clear.
      _logger.warn(
        'the provider refused to end the session',
        op: LogOp.authToken,
        fields: <String, Object?>{'err': error.runtimeType.toString()},
      );
    }

    _logger.info('signed out', op: LogOp.authToken);
  }

  Future<TokenResponse> _exchange(Future<TokenResponse> Function() call) async {
    try {
      return await call();
    } on FlutterAppAuthUserCancelledException {
      throw AuthenticationFailure(traceId: _traceIds.next());
    } on FlutterAppAuthPlatformException catch (error) {
      _logger.warn(
        'the provider refused the exchange',
        op: LogOp.authToken,
        fields: <String, Object?>{'err': error.code},
      );
      throw AuthenticationFailure(traceId: _traceIds.next());
    }
  }

  Future<AuthSession> _persist(TokenResponse response, {String? fallbackUserId}) async {
    final String? accessToken = response.accessToken;
    final String? userId = subjectOf(response.idToken) ?? fallbackUserId;

    if (accessToken == null || userId == null) {
      throw AuthenticationFailure(traceId: _traceIds.next());
    }

    final DateTime issuedAt = _now();
    final DateTime expiresAt =
        response.accessTokenExpirationDateTime ?? issuedAt.add(assumedTokenLifetime);

    final AuthSession session = AuthSession(
      accessToken: accessToken,
      refreshToken: response.refreshToken,
      userId: userId,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
    );

    await _store.write(CredentialKeys.accessToken, accessToken);
    await _store.write(CredentialKeys.userId, userId);
    await _store.write(CredentialKeys.issuedAt, issuedAt.toIso8601String());
    await _store.write(CredentialKeys.expiresAt, expiresAt.toIso8601String());

    final String? refreshToken = response.refreshToken;
    if (refreshToken != null) {
      await _store.write(CredentialKeys.refreshToken, refreshToken);
    }

    final String? idToken = response.idToken;
    if (idToken != null) {
      await _store.write(CredentialKeys.idToken, idToken);
    }

    return session;
  }

  DateTime? _instant(String? value) => value == null ? null : DateTime.tryParse(value);
}
