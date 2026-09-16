// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trace_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The generator of trace identifiers.

@ProviderFor(traceIds)
final traceIdsProvider = TraceIdsProvider._();

/// The generator of trace identifiers.

final class TraceIdsProvider extends $FunctionalProvider<TraceIds, TraceIds, TraceIds>
    with $Provider<TraceIds> {
  /// The generator of trace identifiers.
  TraceIdsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'traceIdsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$traceIdsHash();

  @$internal
  @override
  $ProviderElement<TraceIds> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  TraceIds create(Ref ref) {
    return traceIds(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TraceIds value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<TraceIds>(value));
  }
}

String _$traceIdsHash() => r'5b145c3be487926e8444cbb8969b7b5f9715b26e';
