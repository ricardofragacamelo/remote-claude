// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'permission_lookup_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Where one request stands, as the server says — what a notification's screen waits for.
///
/// Asked once per opening, and never answered from the notification (S-45). Opening the same link
/// twice asks twice and sends nothing: asking is all an opening does (S-47).

@ProviderFor(permissionLookup)
final permissionLookupProvider = PermissionLookupFamily._();

/// Where one request stands, as the server says — what a notification's screen waits for.
///
/// Asked once per opening, and never answered from the notification (S-45). Opening the same link
/// twice asks twice and sends nothing: asking is all an opening does (S-47).

final class PermissionLookupProvider
    extends
        $FunctionalProvider<
          AsyncValue<PermissionLookup>,
          PermissionLookup,
          FutureOr<PermissionLookup>
        >
    with $FutureModifier<PermissionLookup>, $FutureProvider<PermissionLookup> {
  /// Where one request stands, as the server says — what a notification's screen waits for.
  ///
  /// Asked once per opening, and never answered from the notification (S-45). Opening the same link
  /// twice asks twice and sends nothing: asking is all an opening does (S-47).
  PermissionLookupProvider._({
    required PermissionLookupFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'permissionLookupProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$permissionLookupHash();

  @override
  String toString() {
    return r'permissionLookupProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  $FutureProviderElement<PermissionLookup> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<PermissionLookup> create(Ref ref) {
    final argument = this.argument as (String, String);
    return permissionLookup(ref, argument.$1, argument.$2);
  }

  @override
  bool operator ==(Object other) {
    return other is PermissionLookupProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$permissionLookupHash() => r'0f1c076966169a55976fa85d5e98d72efeeffcef';

/// Where one request stands, as the server says — what a notification's screen waits for.
///
/// Asked once per opening, and never answered from the notification (S-45). Opening the same link
/// twice asks twice and sends nothing: asking is all an opening does (S-47).

final class PermissionLookupFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<PermissionLookup>, (String, String)> {
  PermissionLookupFamily._()
    : super(
        retry: _neverRetry,
        name: r'permissionLookupProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// Where one request stands, as the server says — what a notification's screen waits for.
  ///
  /// Asked once per opening, and never answered from the notification (S-45). Opening the same link
  /// twice asks twice and sends nothing: asking is all an opening does (S-47).

  PermissionLookupProvider call(String sessionId, String requestId) =>
      PermissionLookupProvider._(argument: (sessionId, requestId), from: this);

  @override
  String toString() => r'permissionLookupProvider';
}

/// The lock preference of this phone.

@ProviderFor(ApprovalLockController)
final approvalLockControllerProvider = ApprovalLockControllerProvider._();

/// The lock preference of this phone.
final class ApprovalLockControllerProvider
    extends $AsyncNotifierProvider<ApprovalLockController, ApprovalLockState> {
  /// The lock preference of this phone.
  ApprovalLockControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'approvalLockControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$approvalLockControllerHash();

  @$internal
  @override
  ApprovalLockController create() => ApprovalLockController();
}

String _$approvalLockControllerHash() => r'2ea55f0ff676636e50a1294e52e07d805ce51177';

/// The lock preference of this phone.

abstract class _$ApprovalLockController extends $AsyncNotifier<ApprovalLockState> {
  FutureOr<ApprovalLockState> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<ApprovalLockState>, ApprovalLockState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<ApprovalLockState>, ApprovalLockState>,
              AsyncValue<ApprovalLockState>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
