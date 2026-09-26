/// Wiring of the installation identity.
library;

import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'device_identity_provider.g.dart';

/// The one installation identity. Kept alive: it is read by the transport on every call.
@Riverpod(keepAlive: true)
DeviceIdentity deviceIdentity(Ref ref) => DeviceIdentity(ref.watch(credentialStoreProvider));
