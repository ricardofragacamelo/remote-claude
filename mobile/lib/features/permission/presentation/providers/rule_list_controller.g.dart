// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rule_list_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The rules screen's state.
///
/// Three decisions here are about the person reading the list while they tap:
///
/// - **a revoked rule leaves the list** from the answer to the revocation, not from a reload: a
///   list that reorders under somebody's thumb is how the wrong rule gets revoked;
/// - **a failed revocation keeps the row**, with the reason next to it (S-21). Replacing the list
///   with an error would hide every rule that is still answering — the one thing this screen is for;
/// - **a second tap on a row being revoked revokes nothing** (S-69). The same reason the permission
///   card takes no second tap: two taps are two requests.

@ProviderFor(RuleListController)
final ruleListControllerProvider = RuleListControllerProvider._();

/// The rules screen's state.
///
/// Three decisions here are about the person reading the list while they tap:
///
/// - **a revoked rule leaves the list** from the answer to the revocation, not from a reload: a
///   list that reorders under somebody's thumb is how the wrong rule gets revoked;
/// - **a failed revocation keeps the row**, with the reason next to it (S-21). Replacing the list
///   with an error would hide every rule that is still answering — the one thing this screen is for;
/// - **a second tap on a row being revoked revokes nothing** (S-69). The same reason the permission
///   card takes no second tap: two taps are two requests.
final class RuleListControllerProvider
    extends $AsyncNotifierProvider<RuleListController, RuleBoard> {
  /// The rules screen's state.
  ///
  /// Three decisions here are about the person reading the list while they tap:
  ///
  /// - **a revoked rule leaves the list** from the answer to the revocation, not from a reload: a
  ///   list that reorders under somebody's thumb is how the wrong rule gets revoked;
  /// - **a failed revocation keeps the row**, with the reason next to it (S-21). Replacing the list
  ///   with an error would hide every rule that is still answering — the one thing this screen is for;
  /// - **a second tap on a row being revoked revokes nothing** (S-69). The same reason the permission
  ///   card takes no second tap: two taps are two requests.
  RuleListControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'ruleListControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$ruleListControllerHash();

  @$internal
  @override
  RuleListController create() => RuleListController();
}

String _$ruleListControllerHash() => r'b922f0b9625334e45d50feb7aed61152d1e76733';

/// The rules screen's state.
///
/// Three decisions here are about the person reading the list while they tap:
///
/// - **a revoked rule leaves the list** from the answer to the revocation, not from a reload: a
///   list that reorders under somebody's thumb is how the wrong rule gets revoked;
/// - **a failed revocation keeps the row**, with the reason next to it (S-21). Replacing the list
///   with an error would hide every rule that is still answering — the one thing this screen is for;
/// - **a second tap on a row being revoked revokes nothing** (S-69). The same reason the permission
///   card takes no second tap: two taps are two requests.

abstract class _$RuleListController extends $AsyncNotifier<RuleBoard> {
  FutureOr<RuleBoard> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<RuleBoard>, RuleBoard>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<RuleBoard>, RuleBoard>,
              AsyncValue<RuleBoard>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
