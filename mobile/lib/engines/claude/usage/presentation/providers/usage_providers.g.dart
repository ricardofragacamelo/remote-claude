// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'usage_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The account's rate-limit windows, over the backend.

@ProviderFor(usageRepository)
final usageRepositoryProvider = UsageRepositoryProvider._();

/// The account's rate-limit windows, over the backend.

final class UsageRepositoryProvider
    extends $FunctionalProvider<UsageRepository, UsageRepository, UsageRepository>
    with $Provider<UsageRepository> {
  /// The account's rate-limit windows, over the backend.
  UsageRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'usageRepositoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$usageRepositoryHash();

  @$internal
  @override
  $ProviderElement<UsageRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  UsageRepository create(Ref ref) {
    return usageRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(UsageRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<UsageRepository>(value),
    );
  }
}

String _$usageRepositoryHash() => r'8574674d350bf5af4f29a56bc5997e34eb7179df';
