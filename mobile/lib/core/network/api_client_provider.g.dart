// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'api_client_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The transport of the HTTP client, on the origin in use — built again on a new address, and the
/// one of the old address closed, so nothing of it answers any more (plan 10, S-101, S-102).

@ProviderFor(httpTransport)
final httpTransportProvider = HttpTransportProvider._();

/// The transport of the HTTP client, on the origin in use — built again on a new address, and the
/// one of the old address closed, so nothing of it answers any more (plan 10, S-101, S-102).

final class HttpTransportProvider extends $FunctionalProvider<Dio, Dio, Dio> with $Provider<Dio> {
  /// The transport of the HTTP client, on the origin in use — built again on a new address, and the
  /// one of the old address closed, so nothing of it answers any more (plan 10, S-101, S-102).
  HttpTransportProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'httpTransportProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$httpTransportHash();

  @$internal
  @override
  $ProviderElement<Dio> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  Dio create(Ref ref) {
    return httpTransport(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Dio value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<Dio>(value));
  }
}

String _$httpTransportHash() => r'ad38a2a474649168c7d934c2523a81aea9df71b1';

/// The one HTTP client. A second one in the project means something escaped the chain.
///
/// It does **not** follow the address: it asks for the transport on each request. When the client
/// itself was built again on a new address, every data source, repository and controller over it
/// was left to be built again too, lazily — the first time a screen read one, in the middle of its
/// build — and Riverpod then marked the provider scope dirty during the frame (found by the e2e of
/// plan 10, S-111). The transport has no one watching it, so rebuilding it moves nothing else.

@ProviderFor(apiClient)
final apiClientProvider = ApiClientProvider._();

/// The one HTTP client. A second one in the project means something escaped the chain.
///
/// It does **not** follow the address: it asks for the transport on each request. When the client
/// itself was built again on a new address, every data source, repository and controller over it
/// was left to be built again too, lazily — the first time a screen read one, in the middle of its
/// build — and Riverpod then marked the provider scope dirty during the frame (found by the e2e of
/// plan 10, S-111). The transport has no one watching it, so rebuilding it moves nothing else.

final class ApiClientProvider extends $FunctionalProvider<ApiClient, ApiClient, ApiClient>
    with $Provider<ApiClient> {
  /// The one HTTP client. A second one in the project means something escaped the chain.
  ///
  /// It does **not** follow the address: it asks for the transport on each request. When the client
  /// itself was built again on a new address, every data source, repository and controller over it
  /// was left to be built again too, lazily — the first time a screen read one, in the middle of its
  /// build — and Riverpod then marked the provider scope dirty during the frame (found by the e2e of
  /// plan 10, S-111). The transport has no one watching it, so rebuilding it moves nothing else.
  ApiClientProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'apiClientProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$apiClientHash();

  @$internal
  @override
  $ProviderElement<ApiClient> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  ApiClient create(Ref ref) {
    return apiClient(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ApiClient value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<ApiClient>(value));
  }
}

String _$apiClientHash() => r'0d1fb46401345489c4085e320c984929d0318205';
