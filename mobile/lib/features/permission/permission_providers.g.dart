// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'permission_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The permission endpoint of the backend.

@ProviderFor(permissionApiDataSource)
final permissionApiDataSourceProvider = PermissionApiDataSourceProvider._();

/// The permission endpoint of the backend.

final class PermissionApiDataSourceProvider
    extends
        $FunctionalProvider<
          PermissionApiDataSource,
          PermissionApiDataSource,
          PermissionApiDataSource
        >
    with $Provider<PermissionApiDataSource> {
  /// The permission endpoint of the backend.
  PermissionApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'permissionApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$permissionApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<PermissionApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PermissionApiDataSource create(Ref ref) {
    return permissionApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PermissionApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PermissionApiDataSource>(value),
    );
  }
}

String _$permissionApiDataSourceHash() => r'037138402f338391c7f3f5548fc07d5b2729c272';

/// The permission repository.

@ProviderFor(permissionRepository)
final permissionRepositoryProvider = PermissionRepositoryProvider._();

/// The permission repository.

final class PermissionRepositoryProvider
    extends $FunctionalProvider<PermissionRepository, PermissionRepository, PermissionRepository>
    with $Provider<PermissionRepository> {
  /// The permission repository.
  PermissionRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'permissionRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$permissionRepositoryHash();

  @$internal
  @override
  $ProviderElement<PermissionRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PermissionRepository create(Ref ref) {
    return permissionRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PermissionRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PermissionRepository>(value),
    );
  }
}

String _$permissionRepositoryHash() => r'86c638e865a90fddfdd1df0698bf5b37ec4acfac';

/// Watches the questions of a session.

@ProviderFor(watchPermissions)
final watchPermissionsProvider = WatchPermissionsProvider._();

/// Watches the questions of a session.

final class WatchPermissionsProvider
    extends $FunctionalProvider<WatchPermissions, WatchPermissions, WatchPermissions>
    with $Provider<WatchPermissions> {
  /// Watches the questions of a session.
  WatchPermissionsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'watchPermissionsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$watchPermissionsHash();

  @$internal
  @override
  $ProviderElement<WatchPermissions> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  WatchPermissions create(Ref ref) {
    return watchPermissions(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WatchPermissions value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<WatchPermissions>(value),
    );
  }
}

String _$watchPermissionsHash() => r'33cc939752af2fc50706b22e49d749fffb45218f';

/// Asks the server where one request stands.

@ProviderFor(lookupPermission)
final lookupPermissionProvider = LookupPermissionProvider._();

/// Asks the server where one request stands.

final class LookupPermissionProvider
    extends $FunctionalProvider<LookupPermission, LookupPermission, LookupPermission>
    with $Provider<LookupPermission> {
  /// Asks the server where one request stands.
  LookupPermissionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'lookupPermissionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$lookupPermissionHash();

  @$internal
  @override
  $ProviderElement<LookupPermission> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  LookupPermission create(Ref ref) {
    return lookupPermission(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(LookupPermission value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<LookupPermission>(value),
    );
  }
}

String _$lookupPermissionHash() => r'50d2f6fa43539426a7e74fe80401909655436886';

/// The device's lock screen.

@ProviderFor(approvalLock)
final approvalLockProvider = ApprovalLockProvider._();

/// The device's lock screen.

final class ApprovalLockProvider
    extends $FunctionalProvider<ApprovalLock, ApprovalLock, ApprovalLock>
    with $Provider<ApprovalLock> {
  /// The device's lock screen.
  ApprovalLockProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'approvalLockProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$approvalLockHash();

  @$internal
  @override
  $ProviderElement<ApprovalLock> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ApprovalLock create(Ref ref) {
    return approvalLock(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ApprovalLock value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ApprovalLock>(value),
    );
  }
}

String _$approvalLockHash() => r'ab861d9851453f32594a7567ffdcc75baecbe28e';

/// Whether approvals ask for the lock.

@ProviderFor(approvalPreferences)
final approvalPreferencesProvider = ApprovalPreferencesProvider._();

/// Whether approvals ask for the lock.

final class ApprovalPreferencesProvider
    extends $FunctionalProvider<ApprovalPreferences, ApprovalPreferences, ApprovalPreferences>
    with $Provider<ApprovalPreferences> {
  /// Whether approvals ask for the lock.
  ApprovalPreferencesProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'approvalPreferencesProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$approvalPreferencesHash();

  @$internal
  @override
  $ProviderElement<ApprovalPreferences> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ApprovalPreferences create(Ref ref) {
    return approvalPreferences(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ApprovalPreferences value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ApprovalPreferences>(value),
    );
  }
}

String _$approvalPreferencesHash() => r'cbeb5b8649b5ab96df751714c5257d7a731e5ded';

/// The gate in front of every yes.

@ProviderFor(gateApproval)
final gateApprovalProvider = GateApprovalProvider._();

/// The gate in front of every yes.

final class GateApprovalProvider
    extends $FunctionalProvider<GateApproval, GateApproval, GateApproval>
    with $Provider<GateApproval> {
  /// The gate in front of every yes.
  GateApprovalProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'gateApprovalProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$gateApprovalHash();

  @$internal
  @override
  $ProviderElement<GateApproval> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  GateApproval create(Ref ref) {
    return gateApproval(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(GateApproval value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<GateApproval>(value),
    );
  }
}

String _$gateApprovalHash() => r'06dcff3aa97707b432d7f6f90517a4acbeef75fe';

/// Reads and changes the lock preference.

@ProviderFor(approvalLockSetting)
final approvalLockSettingProvider = ApprovalLockSettingProvider._();

/// Reads and changes the lock preference.

final class ApprovalLockSettingProvider
    extends $FunctionalProvider<ApprovalLockSetting, ApprovalLockSetting, ApprovalLockSetting>
    with $Provider<ApprovalLockSetting> {
  /// Reads and changes the lock preference.
  ApprovalLockSettingProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'approvalLockSettingProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$approvalLockSettingHash();

  @$internal
  @override
  $ProviderElement<ApprovalLockSetting> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ApprovalLockSetting create(Ref ref) {
    return approvalLockSetting(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ApprovalLockSetting value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ApprovalLockSetting>(value),
    );
  }
}

String _$approvalLockSettingHash() => r'ae783071e779ad3f9ccbe44add32365142b39e54';

/// The clock the countdowns read. A provider, so a test decides what time it is.

@ProviderFor(permissionClock)
final permissionClockProvider = PermissionClockProvider._();

/// The clock the countdowns read. A provider, so a test decides what time it is.

final class PermissionClockProvider
    extends $FunctionalProvider<DateTime Function(), DateTime Function(), DateTime Function()>
    with $Provider<DateTime Function()> {
  /// The clock the countdowns read. A provider, so a test decides what time it is.
  PermissionClockProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'permissionClockProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$permissionClockHash();

  @$internal
  @override
  $ProviderElement<DateTime Function()> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DateTime Function() create(Ref ref) {
    return permissionClock(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DateTime Function() value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DateTime Function()>(value),
    );
  }
}

String _$permissionClockHash() => r'a25e8fe85fcd92a5b9e199399615f66f9753e753';

/// The rule endpoints of the backend.

@ProviderFor(permissionRuleApiDataSource)
final permissionRuleApiDataSourceProvider = PermissionRuleApiDataSourceProvider._();

/// The rule endpoints of the backend.

final class PermissionRuleApiDataSourceProvider
    extends
        $FunctionalProvider<
          PermissionRuleApiDataSource,
          PermissionRuleApiDataSource,
          PermissionRuleApiDataSource
        >
    with $Provider<PermissionRuleApiDataSource> {
  /// The rule endpoints of the backend.
  PermissionRuleApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'permissionRuleApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$permissionRuleApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<PermissionRuleApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PermissionRuleApiDataSource create(Ref ref) {
    return permissionRuleApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PermissionRuleApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PermissionRuleApiDataSource>(value),
    );
  }
}

String _$permissionRuleApiDataSourceHash() => r'18345854d362287820dbd9fe10fc660d8d3e1da4';

/// The rule repository.

@ProviderFor(permissionRuleRepository)
final permissionRuleRepositoryProvider = PermissionRuleRepositoryProvider._();

/// The rule repository.

final class PermissionRuleRepositoryProvider
    extends
        $FunctionalProvider<
          PermissionRuleRepository,
          PermissionRuleRepository,
          PermissionRuleRepository
        >
    with $Provider<PermissionRuleRepository> {
  /// The rule repository.
  PermissionRuleRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'permissionRuleRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$permissionRuleRepositoryHash();

  @$internal
  @override
  $ProviderElement<PermissionRuleRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PermissionRuleRepository create(Ref ref) {
    return permissionRuleRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PermissionRuleRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PermissionRuleRepository>(value),
    );
  }
}

String _$permissionRuleRepositoryHash() => r'a27cb89e5c71d0c41a7eb8e1812e9aa9c549b1f4';

/// Reads the rules of the signed-in user.

@ProviderFor(listRules)
final listRulesProvider = ListRulesProvider._();

/// Reads the rules of the signed-in user.

final class ListRulesProvider extends $FunctionalProvider<ListRules, ListRules, ListRules>
    with $Provider<ListRules> {
  /// Reads the rules of the signed-in user.
  ListRulesProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listRulesProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listRulesHash();

  @$internal
  @override
  $ProviderElement<ListRules> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  ListRules create(Ref ref) {
    return listRules(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListRules value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<ListRules>(value));
  }
}

String _$listRulesHash() => r'74dca502eecd79085b9a053dfb83565e76ce3858';

/// Takes a rule back.

@ProviderFor(revokeRule)
final revokeRuleProvider = RevokeRuleProvider._();

/// Takes a rule back.

final class RevokeRuleProvider extends $FunctionalProvider<RevokeRule, RevokeRule, RevokeRule>
    with $Provider<RevokeRule> {
  /// Takes a rule back.
  RevokeRuleProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'revokeRuleProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$revokeRuleHash();

  @$internal
  @override
  $ProviderElement<RevokeRule> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  RevokeRule create(Ref ref) {
    return revokeRule(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RevokeRule value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<RevokeRule>(value));
  }
}

String _$revokeRuleHash() => r'568df0784bcf19b55015401a6495d88987b9af2b';
