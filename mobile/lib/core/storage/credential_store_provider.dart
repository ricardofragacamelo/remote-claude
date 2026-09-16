/// The secure credential store, as a provider.
library;

import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'credential_store_provider.g.dart';

/// Where the credential survives a restart.
@Riverpod(keepAlive: true)
CredentialStore credentialStore(Ref ref) => const SecureCredentialStore();
