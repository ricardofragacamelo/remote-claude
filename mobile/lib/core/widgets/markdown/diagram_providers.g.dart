// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'diagram_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.

@ProviderFor(diagramEngine)
final diagramEngineProvider = DiagramEngineProvider._();

/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.

final class DiagramEngineProvider
    extends $FunctionalProvider<DiagramEngine, DiagramEngine, DiagramEngine>
    with $Provider<DiagramEngine> {
  /// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
  /// start is paid once.
  DiagramEngineProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'diagramEngineProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$diagramEngineHash();

  @$internal
  @override
  $ProviderElement<DiagramEngine> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DiagramEngine create(Ref ref) {
    return diagramEngine(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DiagramEngine value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DiagramEngine>(value),
    );
  }
}

String _$diagramEngineHash() => r'09fd6842267af73be5a12ac765ed56e345d92d10';

/// The diagrams, one at a time, within ceilings, and kept.

@ProviderFor(diagramQueue)
final diagramQueueProvider = DiagramQueueProvider._();

/// The diagrams, one at a time, within ceilings, and kept.

final class DiagramQueueProvider
    extends $FunctionalProvider<DiagramQueue, DiagramQueue, DiagramQueue>
    with $Provider<DiagramQueue> {
  /// The diagrams, one at a time, within ceilings, and kept.
  DiagramQueueProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'diagramQueueProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$diagramQueueHash();

  @$internal
  @override
  $ProviderElement<DiagramQueue> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DiagramQueue create(Ref ref) {
    return diagramQueue(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DiagramQueue value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DiagramQueue>(value),
    );
  }
}

String _$diagramQueueHash() => r'852bb7d601c05f8e3ca2c10ec36f4cd90e0cf37e';
