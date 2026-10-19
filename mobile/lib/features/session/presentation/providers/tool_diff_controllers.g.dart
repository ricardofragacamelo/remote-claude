// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tool_diff_controllers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The diff of one tool of [sessionId], read **once** when its card is first opened.

@ProviderFor(ToolDiffController)
final toolDiffControllerProvider = ToolDiffControllerFamily._();

/// The diff of one tool of [sessionId], read **once** when its card is first opened.
final class ToolDiffControllerProvider
    extends $AsyncNotifierProvider<ToolDiffController, ToolDiff> {
  /// The diff of one tool of [sessionId], read **once** when its card is first opened.
  ToolDiffControllerProvider._({
    required ToolDiffControllerFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'toolDiffControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$toolDiffControllerHash();

  @override
  String toString() {
    return r'toolDiffControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  ToolDiffController create() => ToolDiffController();

  @override
  bool operator ==(Object other) {
    return other is ToolDiffControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$toolDiffControllerHash() => r'ad6d881eeec8beb67859a013fc59d044c9157fb5';

/// The diff of one tool of [sessionId], read **once** when its card is first opened.

final class ToolDiffControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ToolDiffController,
          AsyncValue<ToolDiff>,
          ToolDiff,
          FutureOr<ToolDiff>,
          (String, String)
        > {
  ToolDiffControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'toolDiffControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The diff of one tool of [sessionId], read **once** when its card is first opened.

  ToolDiffControllerProvider call(String sessionId, String toolUseId) =>
      ToolDiffControllerProvider._(argument: (sessionId, toolUseId), from: this);

  @override
  String toString() => r'toolDiffControllerProvider';
}

/// The diff of one tool of [sessionId], read **once** when its card is first opened.

abstract class _$ToolDiffController extends $AsyncNotifier<ToolDiff> {
  late final _$args = ref.$arg as (String, String);
  String get sessionId => _$args.$1;
  String get toolUseId => _$args.$2;

  FutureOr<ToolDiff> build(String sessionId, String toolUseId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<ToolDiff>, ToolDiff>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<ToolDiff>, ToolDiff>,
              AsyncValue<ToolDiff>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}
