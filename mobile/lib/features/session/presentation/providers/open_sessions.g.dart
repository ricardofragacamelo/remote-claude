// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'open_sessions.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Folder → the ids of its sessions open in the app, in the order they entered.

@ProviderFor(OpenSessions)
final openSessionsProvider = OpenSessionsProvider._();

/// Folder → the ids of its sessions open in the app, in the order they entered.
final class OpenSessionsProvider
    extends $NotifierProvider<OpenSessions, Map<String, List<String>>> {
  /// Folder → the ids of its sessions open in the app, in the order they entered.
  OpenSessionsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'openSessionsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$openSessionsHash();

  @$internal
  @override
  OpenSessions create() => OpenSessions();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Map<String, List<String>> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Map<String, List<String>>>(value),
    );
  }
}

String _$openSessionsHash() => r'86346601ca75fe807b6d601c6d02af4bf27a036c';

/// Folder → the ids of its sessions open in the app, in the order they entered.

abstract class _$OpenSessions extends $Notifier<Map<String, List<String>>> {
  Map<String, List<String>> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Map<String, List<String>>, Map<String, List<String>>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Map<String, List<String>>, Map<String, List<String>>>,
              Map<String, List<String>>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
