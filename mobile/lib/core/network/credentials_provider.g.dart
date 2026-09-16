// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'credentials_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one credential holder. Kept alive: it is what the transport reads on every call.

@ProviderFor(credentials)
final credentialsProvider = CredentialsProvider._();

/// The one credential holder. Kept alive: it is what the transport reads on every call.

final class CredentialsProvider extends $FunctionalProvider<Credentials, Credentials, Credentials>
    with $Provider<Credentials> {
  /// The one credential holder. Kept alive: it is what the transport reads on every call.
  CredentialsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'credentialsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$credentialsHash();

  @$internal
  @override
  $ProviderElement<Credentials> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  Credentials create(Ref ref) {
    return credentials(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Credentials value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Credentials>(value),
    );
  }
}

String _$credentialsHash() => r'70726fb08a871952d339f1bbe661a4d3af7364c0';
