// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'insight_controllers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The catalogue of a folder's installation, for its draft.

@ProviderFor(CatalogController)
final catalogControllerProvider = CatalogControllerFamily._();

/// The catalogue of a folder's installation, for its draft.
final class CatalogControllerProvider
    extends $AsyncNotifierProvider<CatalogController, InstallationCatalog> {
  /// The catalogue of a folder's installation, for its draft.
  CatalogControllerProvider._({
    required CatalogControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'catalogControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$catalogControllerHash();

  @override
  String toString() {
    return r'catalogControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  CatalogController create() => CatalogController();

  @override
  bool operator ==(Object other) {
    return other is CatalogControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$catalogControllerHash() => r'3c40aae7e10bf90a304452404f64abea1218fec0';

/// The catalogue of a folder's installation, for its draft.

final class CatalogControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          CatalogController,
          AsyncValue<InstallationCatalog>,
          InstallationCatalog,
          FutureOr<InstallationCatalog>,
          String
        > {
  CatalogControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'catalogControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The catalogue of a folder's installation, for its draft.

  CatalogControllerProvider call(String workspacePath) =>
      CatalogControllerProvider._(argument: workspacePath, from: this);

  @override
  String toString() => r'catalogControllerProvider';
}

/// The catalogue of a folder's installation, for its draft.

abstract class _$CatalogController extends $AsyncNotifier<InstallationCatalog> {
  late final _$args = ref.$arg as String;
  String get workspacePath => _$args;

  FutureOr<InstallationCatalog> build(String workspacePath);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<InstallationCatalog>, InstallationCatalog>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<InstallationCatalog>, InstallationCatalog>,
              AsyncValue<InstallationCatalog>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}

/// The models a live session can switch to, and the one it runs.

@ProviderFor(SessionModelsController)
final sessionModelsControllerProvider = SessionModelsControllerFamily._();

/// The models a live session can switch to, and the one it runs.
final class SessionModelsControllerProvider
    extends $AsyncNotifierProvider<SessionModelsController, SessionModels> {
  /// The models a live session can switch to, and the one it runs.
  SessionModelsControllerProvider._({
    required SessionModelsControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'sessionModelsControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$sessionModelsControllerHash();

  @override
  String toString() {
    return r'sessionModelsControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  SessionModelsController create() => SessionModelsController();

  @override
  bool operator ==(Object other) {
    return other is SessionModelsControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$sessionModelsControllerHash() => r'05f2e177824322992b92b051b699ded19b0ab37e';

/// The models a live session can switch to, and the one it runs.

final class SessionModelsControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          SessionModelsController,
          AsyncValue<SessionModels>,
          SessionModels,
          FutureOr<SessionModels>,
          String
        > {
  SessionModelsControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'sessionModelsControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The models a live session can switch to, and the one it runs.

  SessionModelsControllerProvider call(String sessionId) =>
      SessionModelsControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'sessionModelsControllerProvider';
}

/// The models a live session can switch to, and the one it runs.

abstract class _$SessionModelsController extends $AsyncNotifier<SessionModels> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  FutureOr<SessionModels> build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<SessionModels>, SessionModels>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<SessionModels>, SessionModels>,
              AsyncValue<SessionModels>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}

/// How full a live session's context window is.
///
/// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
/// conversation was compacted — it shrank (B-14).

@ProviderFor(SessionContextController)
final sessionContextControllerProvider = SessionContextControllerFamily._();

/// How full a live session's context window is.
///
/// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
/// conversation was compacted — it shrank (B-14).
final class SessionContextControllerProvider
    extends $AsyncNotifierProvider<SessionContextController, ContextUse> {
  /// How full a live session's context window is.
  ///
  /// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
  /// conversation was compacted — it shrank (B-14).
  SessionContextControllerProvider._({
    required SessionContextControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'sessionContextControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$sessionContextControllerHash();

  @override
  String toString() {
    return r'sessionContextControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  SessionContextController create() => SessionContextController();

  @override
  bool operator ==(Object other) {
    return other is SessionContextControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$sessionContextControllerHash() => r'd79081ee92f3832e49d1369c687109252879135e';

/// How full a live session's context window is.
///
/// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
/// conversation was compacted — it shrank (B-14).

final class SessionContextControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          SessionContextController,
          AsyncValue<ContextUse>,
          ContextUse,
          FutureOr<ContextUse>,
          String
        > {
  SessionContextControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'sessionContextControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// How full a live session's context window is.
  ///
  /// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
  /// conversation was compacted — it shrank (B-14).

  SessionContextControllerProvider call(String sessionId) =>
      SessionContextControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'sessionContextControllerProvider';
}

/// How full a live session's context window is.
///
/// Read again whenever it changes for certain: a turn ended — the conversation grew — or the
/// conversation was compacted — it shrank (B-14).

abstract class _$SessionContextController extends $AsyncNotifier<ContextUse> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  FutureOr<ContextUse> build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<ContextUse>, ContextUse>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<ContextUse>, ContextUse>,
              AsyncValue<ContextUse>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
