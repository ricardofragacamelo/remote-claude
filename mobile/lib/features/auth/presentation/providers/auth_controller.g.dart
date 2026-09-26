// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The signed-in session, or `null`.

@ProviderFor(AuthController)
final authControllerProvider = AuthControllerProvider._();

/// The signed-in session, or `null`.
final class AuthControllerProvider extends $AsyncNotifierProvider<AuthController, AuthSession?> {
  /// The signed-in session, or `null`.
  AuthControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'authControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$authControllerHash();

  @$internal
  @override
  AuthController create() => AuthController();
}

String _$authControllerHash() => r'68985c4099adcaf28ae067ffd5097c31279089b3';

/// The signed-in session, or `null`.

abstract class _$AuthController extends $AsyncNotifier<AuthSession?> {
  FutureOr<AuthSession?> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<AuthSession?>, AuthSession?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<AuthSession?>, AuthSession?>,
              AsyncValue<AuthSession?>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
