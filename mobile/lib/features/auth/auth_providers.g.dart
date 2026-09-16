// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The provider, behind the interface the use cases depend on.

@ProviderFor(oidcAuthDataSource)
final oidcAuthDataSourceProvider = OidcAuthDataSourceProvider._();

/// The provider, behind the interface the use cases depend on.

final class OidcAuthDataSourceProvider
    extends $FunctionalProvider<OidcAuthDataSource, OidcAuthDataSource, OidcAuthDataSource>
    with $Provider<OidcAuthDataSource> {
  /// The provider, behind the interface the use cases depend on.
  OidcAuthDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'oidcAuthDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$oidcAuthDataSourceHash();

  @$internal
  @override
  $ProviderElement<OidcAuthDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  OidcAuthDataSource create(Ref ref) {
    return oidcAuthDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(OidcAuthDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<OidcAuthDataSource>(value),
    );
  }
}

String _$oidcAuthDataSourceHash() => r'fcc0e56a8ebd697e0f59944fd12281800a7c975b';

/// The auth repository.

@ProviderFor(authRepository)
final authRepositoryProvider = AuthRepositoryProvider._();

/// The auth repository.

final class AuthRepositoryProvider
    extends $FunctionalProvider<AuthRepository, AuthRepository, AuthRepository>
    with $Provider<AuthRepository> {
  /// The auth repository.
  AuthRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'authRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$authRepositoryHash();

  @$internal
  @override
  $ProviderElement<AuthRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  AuthRepository create(Ref ref) {
    return authRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AuthRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<AuthRepository>(value),
    );
  }
}

String _$authRepositoryHash() => r'23a581b1356ae604379d4f2e35a02a6cba1c1809';

/// Signs in through the system's external tab.

@ProviderFor(signIn)
final signInProvider = SignInProvider._();

/// Signs in through the system's external tab.

final class SignInProvider extends $FunctionalProvider<SignIn, SignIn, SignIn>
    with $Provider<SignIn> {
  /// Signs in through the system's external tab.
  SignInProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'signInProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$signInHash();

  @$internal
  @override
  $ProviderElement<SignIn> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  SignIn create(Ref ref) {
    return signIn(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SignIn value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<SignIn>(value));
  }
}

String _$signInHash() => r'ca8e1ad18c74f1f61869d666372372b45b7b8594';

/// Brings back the session stored on this device.

@ProviderFor(restoreSession)
final restoreSessionProvider = RestoreSessionProvider._();

/// Brings back the session stored on this device.

final class RestoreSessionProvider
    extends $FunctionalProvider<RestoreSession, RestoreSession, RestoreSession>
    with $Provider<RestoreSession> {
  /// Brings back the session stored on this device.
  RestoreSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'restoreSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$restoreSessionHash();

  @$internal
  @override
  $ProviderElement<RestoreSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  RestoreSession create(Ref ref) {
    return restoreSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RestoreSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RestoreSession>(value),
    );
  }
}

String _$restoreSessionHash() => r'78a0ae7e58132ff19d237d7fa0930068182d83d1';

/// Renews the credential.

@ProviderFor(renewSession)
final renewSessionProvider = RenewSessionProvider._();

/// Renews the credential.

final class RenewSessionProvider
    extends $FunctionalProvider<RenewSession, RenewSession, RenewSession>
    with $Provider<RenewSession> {
  /// Renews the credential.
  RenewSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'renewSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$renewSessionHash();

  @$internal
  @override
  $ProviderElement<RenewSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  RenewSession create(Ref ref) {
    return renewSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RenewSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RenewSession>(value),
    );
  }
}

String _$renewSessionHash() => r'1e073edd3a731280362a9e3412c30567ad32047a';

/// Ends the session on this device.

@ProviderFor(signOut)
final signOutProvider = SignOutProvider._();

/// Ends the session on this device.

final class SignOutProvider extends $FunctionalProvider<SignOut, SignOut, SignOut>
    with $Provider<SignOut> {
  /// Ends the session on this device.
  SignOutProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'signOutProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$signOutHash();

  @$internal
  @override
  $ProviderElement<SignOut> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  SignOut create(Ref ref) {
    return signOut(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SignOut value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<SignOut>(value));
  }
}

String _$signOutHash() => r'01973a8db9f699c97483ac36c6cfbd3b6af96d5b';
