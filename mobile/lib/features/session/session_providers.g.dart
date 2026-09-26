// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The session's edge of the socket.

@ProviderFor(sessionWsDataSource)
final sessionWsDataSourceProvider = SessionWsDataSourceProvider._();

/// The session's edge of the socket.

final class SessionWsDataSourceProvider
    extends $FunctionalProvider<SessionWsDataSource, SessionWsDataSource, SessionWsDataSource>
    with $Provider<SessionWsDataSource> {
  /// The session's edge of the socket.
  SessionWsDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionWsDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionWsDataSourceHash();

  @$internal
  @override
  $ProviderElement<SessionWsDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SessionWsDataSource create(Ref ref) {
    return sessionWsDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionWsDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionWsDataSource>(value),
    );
  }
}

String _$sessionWsDataSourceHash() => r'2861736adf06de53d11ea3874cf29351f794f1ab';

/// The session repository.

@ProviderFor(sessionRepository)
final sessionRepositoryProvider = SessionRepositoryProvider._();

/// The session repository.

final class SessionRepositoryProvider
    extends $FunctionalProvider<SessionRepository, SessionRepository, SessionRepository>
    with $Provider<SessionRepository> {
  /// The session repository.
  SessionRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionRepositoryHash();

  @$internal
  @override
  $ProviderElement<SessionRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SessionRepository create(Ref ref) {
    return sessionRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionRepository>(value),
    );
  }
}

String _$sessionRepositoryHash() => r'05a83f7715f2ebd085d603538b5ba653e1396e9b';

/// Watches a session's stream.

@ProviderFor(watchSession)
final watchSessionProvider = WatchSessionProvider._();

/// Watches a session's stream.

final class WatchSessionProvider
    extends $FunctionalProvider<WatchSession, WatchSession, WatchSession>
    with $Provider<WatchSession> {
  /// Watches a session's stream.
  WatchSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'watchSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$watchSessionHash();

  @$internal
  @override
  $ProviderElement<WatchSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  WatchSession create(Ref ref) {
    return watchSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WatchSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<WatchSession>(value),
    );
  }
}

String _$watchSessionHash() => r'78b2430db65d45e62e6b268432cc9d4ed65ad68a';

/// Sends the one command of the walking skeleton.

@ProviderFor(pingSession)
final pingSessionProvider = PingSessionProvider._();

/// Sends the one command of the walking skeleton.

final class PingSessionProvider extends $FunctionalProvider<PingSession, PingSession, PingSession>
    with $Provider<PingSession> {
  /// Sends the one command of the walking skeleton.
  PingSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pingSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pingSessionHash();

  @$internal
  @override
  $ProviderElement<PingSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PingSession create(Ref ref) {
    return pingSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PingSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PingSession>(value),
    );
  }
}

String _$pingSessionHash() => r'40cc230b798c043bfaa96b9988b65eedfafda57f';

/// Drives a session: start, prompt, interrupt and close.

@ProviderFor(driveSession)
final driveSessionProvider = DriveSessionProvider._();

/// Drives a session: start, prompt, interrupt and close.

final class DriveSessionProvider
    extends $FunctionalProvider<DriveSession, DriveSession, DriveSession>
    with $Provider<DriveSession> {
  /// Drives a session: start, prompt, interrupt and close.
  DriveSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'driveSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$driveSessionHash();

  @$internal
  @override
  $ProviderElement<DriveSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DriveSession create(Ref ref) {
    return driveSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DriveSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DriveSession>(value),
    );
  }
}

String _$driveSessionHash() => r'37ec9df60e56e3f8d2de2d72e3043a32dc7888f4';
