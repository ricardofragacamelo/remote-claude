// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'permission_queue_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The permission queue of one session.
///
/// Keyed by the session, because the session on screen is navigation state and lives in the route.
/// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
/// subscriber from the session (D-24).
///
/// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
/// as refused — the server has already refused it — and that has to happen whether or not anything
/// on screen is rebuilding (S-81).

@ProviderFor(PermissionQueueController)
final permissionQueueControllerProvider = PermissionQueueControllerFamily._();

/// The permission queue of one session.
///
/// Keyed by the session, because the session on screen is navigation state and lives in the route.
/// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
/// subscriber from the session (D-24).
///
/// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
/// as refused — the server has already refused it — and that has to happen whether or not anything
/// on screen is rebuilding (S-81).
final class PermissionQueueControllerProvider
    extends $NotifierProvider<PermissionQueueController, PermissionQueue> {
  /// The permission queue of one session.
  ///
  /// Keyed by the session, because the session on screen is navigation state and lives in the route.
  /// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
  /// subscriber from the session (D-24).
  ///
  /// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
  /// as refused — the server has already refused it — and that has to happen whether or not anything
  /// on screen is rebuilding (S-81).
  PermissionQueueControllerProvider._({
    required PermissionQueueControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'permissionQueueControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$permissionQueueControllerHash();

  @override
  String toString() {
    return r'permissionQueueControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  PermissionQueueController create() => PermissionQueueController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PermissionQueue value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PermissionQueue>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is PermissionQueueControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$permissionQueueControllerHash() => r'b282df5b22a35aa92decccfd4540f0a7b44f6c22';

/// The permission queue of one session.
///
/// Keyed by the session, because the session on screen is navigation state and lives in the route.
/// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
/// subscriber from the session (D-24).
///
/// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
/// as refused — the server has already refused it — and that has to happen whether or not anything
/// on screen is rebuilding (S-81).

final class PermissionQueueControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          PermissionQueueController,
          PermissionQueue,
          PermissionQueue,
          PermissionQueue,
          String
        > {
  PermissionQueueControllerFamily._()
    : super(
        retry: null,
        name: r'permissionQueueControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The permission queue of one session.
  ///
  /// Keyed by the session, because the session on screen is navigation state and lives in the route.
  /// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
  /// subscriber from the session (D-24).
  ///
  /// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
  /// as refused — the server has already refused it — and that has to happen whether or not anything
  /// on screen is rebuilding (S-81).

  PermissionQueueControllerProvider call(String sessionId) =>
      PermissionQueueControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'permissionQueueControllerProvider';
}

/// The permission queue of one session.
///
/// Keyed by the session, because the session on screen is navigation state and lives in the route.
/// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
/// subscriber from the session (D-24).
///
/// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
/// as refused — the server has already refused it — and that has to happen whether or not anything
/// on screen is rebuilding (S-81).

abstract class _$PermissionQueueController extends $Notifier<PermissionQueue> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  PermissionQueue build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<PermissionQueue, PermissionQueue>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<PermissionQueue, PermissionQueue>,
              PermissionQueue,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
