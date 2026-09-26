// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'credential_store_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Where the credential survives a restart.

@ProviderFor(credentialStore)
final credentialStoreProvider = CredentialStoreProvider._();

/// Where the credential survives a restart.

final class CredentialStoreProvider
    extends $FunctionalProvider<CredentialStore, CredentialStore, CredentialStore>
    with $Provider<CredentialStore> {
  /// Where the credential survives a restart.
  CredentialStoreProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'credentialStoreProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$credentialStoreHash();

  @$internal
  @override
  $ProviderElement<CredentialStore> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  CredentialStore create(Ref ref) {
    return credentialStore(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(CredentialStore value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<CredentialStore>(value),
    );
  }
}

String _$credentialStoreHash() => r'ac157de9777f0e03275ce46efd4807833982d22f';
