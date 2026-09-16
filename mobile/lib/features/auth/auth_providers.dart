/// Wiring of the auth feature: its composition root.
///
/// It sits at the feature's root rather than in one of the three layers, because it is the one
/// file that has to see all of them. `domain/` is pure Dart, so a Riverpod annotation cannot go
/// next to a use case; `presentation/` must not reach into `data/`, so it cannot build the
/// repository either. The composition root is what is left, and it is where composition belongs.
library;

import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/auth/data/datasources/oidc_auth_data_source.dart';
import 'package:remote_claude/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/auth/domain/usecases/renew_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/restore_session.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_in.dart';
import 'package:remote_claude/features/auth/domain/usecases/sign_out.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'auth_providers.g.dart';

/// The provider, behind the interface the use cases depend on.
@Riverpod(keepAlive: true)
OidcAuthDataSource oidcAuthDataSource(Ref ref) =>
    AppAuthDataSource(config: ref.watch(appConfigProvider));

/// The auth repository.
@Riverpod(keepAlive: true)
AuthRepository authRepository(Ref ref) => AuthRepositoryImpl(
  oidc: ref.watch(oidcAuthDataSourceProvider),
  store: ref.watch(credentialStoreProvider),
  logger: ref.watch(appLoggerProvider),
  traceIds: ref.watch(traceIdsProvider),
);

/// Signs in through the system's external tab.
@Riverpod(keepAlive: true)
SignIn signIn(Ref ref) => SignIn(ref.watch(authRepositoryProvider));

/// Brings back the session stored on this device.
@Riverpod(keepAlive: true)
RestoreSession restoreSession(Ref ref) =>
    RestoreSession(ref.watch(authRepositoryProvider), DateTime.now);

/// Renews the credential.
@Riverpod(keepAlive: true)
RenewSession renewSession(Ref ref) => RenewSession(ref.watch(authRepositoryProvider));

/// Ends the session on this device.
@Riverpod(keepAlive: true)
SignOut signOut(Ref ref) => SignOut(ref.watch(authRepositoryProvider));
