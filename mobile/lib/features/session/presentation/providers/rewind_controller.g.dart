// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rewind_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The undo of one session, keyed by it.
///
/// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
/// stream, which the session screen underneath keeps attached.

@ProviderFor(RewindController)
final rewindControllerProvider = RewindControllerFamily._();

/// The undo of one session, keyed by it.
///
/// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
/// stream, which the session screen underneath keeps attached.
final class RewindControllerProvider extends $AsyncNotifierProvider<RewindController, RewindBoard> {
  /// The undo of one session, keyed by it.
  ///
  /// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
  /// stream, which the session screen underneath keeps attached.
  RewindControllerProvider._({
    required RewindControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'rewindControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$rewindControllerHash();

  @override
  String toString() {
    return r'rewindControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  RewindController create() => RewindController();

  @override
  bool operator ==(Object other) {
    return other is RewindControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$rewindControllerHash() => r'd135837d8910f0e27400c292e70e61b28a59e6ab';

/// The undo of one session, keyed by it.
///
/// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
/// stream, which the session screen underneath keeps attached.

final class RewindControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          RewindController,
          AsyncValue<RewindBoard>,
          RewindBoard,
          FutureOr<RewindBoard>,
          String
        > {
  RewindControllerFamily._()
    : super(
        retry: null,
        name: r'rewindControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The undo of one session, keyed by it.
  ///
  /// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
  /// stream, which the session screen underneath keeps attached.

  RewindControllerProvider call(String sessionId) =>
      RewindControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'rewindControllerProvider';
}

/// The undo of one session, keyed by it.
///
/// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
/// stream, which the session screen underneath keeps attached.

abstract class _$RewindController extends $AsyncNotifier<RewindBoard> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  FutureOr<RewindBoard> build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<RewindBoard>, RewindBoard>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<RewindBoard>, RewindBoard>,
              AsyncValue<RewindBoard>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
