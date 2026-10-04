// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'directory_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The subfolders of [path] — one level, on demand, never the tree.

@ProviderFor(DirectoryController)
final directoryControllerProvider = DirectoryControllerFamily._();

/// The subfolders of [path] — one level, on demand, never the tree.
final class DirectoryControllerProvider
    extends $AsyncNotifierProvider<DirectoryController, DirectoryListing> {
  /// The subfolders of [path] — one level, on demand, never the tree.
  DirectoryControllerProvider._({
    required DirectoryControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'directoryControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$directoryControllerHash();

  @override
  String toString() {
    return r'directoryControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  DirectoryController create() => DirectoryController();

  @override
  bool operator ==(Object other) {
    return other is DirectoryControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$directoryControllerHash() => r'5b98b0244d63926c31672d8146b663b6877aaa0c';

/// The subfolders of [path] — one level, on demand, never the tree.

final class DirectoryControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          DirectoryController,
          AsyncValue<DirectoryListing>,
          DirectoryListing,
          FutureOr<DirectoryListing>,
          String
        > {
  DirectoryControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'directoryControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The subfolders of [path] — one level, on demand, never the tree.

  DirectoryControllerProvider call(String path) =>
      DirectoryControllerProvider._(argument: path, from: this);

  @override
  String toString() => r'directoryControllerProvider';
}

/// The subfolders of [path] — one level, on demand, never the tree.

abstract class _$DirectoryController extends $AsyncNotifier<DirectoryListing> {
  late final _$args = ref.$arg as String;
  String get path => _$args;

  FutureOr<DirectoryListing> build(String path);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<DirectoryListing>, DirectoryListing>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<DirectoryListing>, DirectoryListing>,
              AsyncValue<DirectoryListing>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
