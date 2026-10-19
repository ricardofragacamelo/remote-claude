// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'audit_trail_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The trail of [kind]'s calls in [sessionId].

@ProviderFor(AuditTrailController)
final auditTrailControllerProvider = AuditTrailControllerFamily._();

/// The trail of [kind]'s calls in [sessionId].
final class AuditTrailControllerProvider
    extends $AsyncNotifierProvider<AuditTrailController, AuditTrailBoard> {
  /// The trail of [kind]'s calls in [sessionId].
  AuditTrailControllerProvider._({
    required AuditTrailControllerFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: null,
         name: r'auditTrailControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$auditTrailControllerHash();

  @override
  String toString() {
    return r'auditTrailControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  AuditTrailController create() => AuditTrailController();

  @override
  bool operator ==(Object other) {
    return other is AuditTrailControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$auditTrailControllerHash() => r'f5f8c5f60e928a1b3c40523a37ff52377e29451d';

/// The trail of [kind]'s calls in [sessionId].

final class AuditTrailControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          AuditTrailController,
          AsyncValue<AuditTrailBoard>,
          AuditTrailBoard,
          FutureOr<AuditTrailBoard>,
          (String, String)
        > {
  AuditTrailControllerFamily._()
    : super(
        retry: null,
        name: r'auditTrailControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The trail of [kind]'s calls in [sessionId].

  AuditTrailControllerProvider call(String sessionId, String kind) =>
      AuditTrailControllerProvider._(argument: (sessionId, kind), from: this);

  @override
  String toString() => r'auditTrailControllerProvider';
}

/// The trail of [kind]'s calls in [sessionId].

abstract class _$AuditTrailController extends $AsyncNotifier<AuditTrailBoard> {
  late final _$args = ref.$arg as (String, String);
  String get sessionId => _$args.$1;
  String get kind => _$args.$2;

  FutureOr<AuditTrailBoard> build(String sessionId, String kind);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<AuditTrailBoard>, AuditTrailBoard>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<AuditTrailBoard>, AuditTrailBoard>,
              AsyncValue<AuditTrailBoard>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}
