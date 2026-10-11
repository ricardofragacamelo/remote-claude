// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'engine_catalogue.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The engines enabled, the default named, and what each can do.

@ProviderFor(engineCatalogue)
final engineCatalogueProvider = EngineCatalogueProvider._();

/// The engines enabled, the default named, and what each can do.

final class EngineCatalogueProvider
    extends
        $FunctionalProvider<AsyncValue<EngineCatalogue>, EngineCatalogue, FutureOr<EngineCatalogue>>
    with $FutureModifier<EngineCatalogue>, $FutureProvider<EngineCatalogue> {
  /// The engines enabled, the default named, and what each can do.
  EngineCatalogueProvider._()
    : super(
        from: null,
        argument: null,
        retry: _neverRetry,
        name: r'engineCatalogueProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$engineCatalogueHash();

  @$internal
  @override
  $FutureProviderElement<EngineCatalogue> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<EngineCatalogue> create(Ref ref) {
    return engineCatalogue(ref);
  }
}

String _$engineCatalogueHash() => r'ed3cf99c37a1be3630eb9523024f85cefb6d94e5';
