/// Wiring of the device feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'dart:io' show Platform;

import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/device/device_identity_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/features/device/data/datasources/device_api_data_source.dart';
import 'package:remote_claude/features/device/data/repositories/device_repository_impl.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';
import 'package:remote_claude/features/device/domain/usecases/check_device.dart';
import 'package:remote_claude/features/device/domain/usecases/forget_push_token.dart';
import 'package:remote_claude/features/device/domain/usecases/register_device.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'device_providers.g.dart';

/// Which operating system this build is running on.
///
/// Overridden in a test, because `dart:io` answers the host there and the registration would
/// claim a platform the contract does not accept.
@Riverpod(keepAlive: true)
String devicePlatform(Ref ref) => Platform.operatingSystem;

/// What the person will recognise in the approval list.
///
/// The operating system and its version, from `dart:io` — deliberately not a plugin. A model name
/// would read better and would cost a platform channel on both platforms; the version is honest,
/// needs nothing, and the list is per account rather than per fleet.
@Riverpod(keepAlive: true)
String deviceName(Ref ref) => '${Platform.operatingSystem} ${Platform.operatingSystemVersion}';

/// The device's edge of the backend.
@Riverpod(keepAlive: true)
DeviceApiDataSource deviceApiDataSource(Ref ref) =>
    HttpDeviceApiDataSource(ref.watch(apiClientProvider));

/// The device repository.
@Riverpod(keepAlive: true)
DeviceRepository deviceRepository(Ref ref) => DeviceRepositoryImpl(
  api: ref.watch(deviceApiDataSourceProvider),
  identity: ref.watch(deviceIdentityProvider),
  config: ref.watch(appConfigProvider),
  credentials: ref.watch(credentialsProvider),
  logger: ref.watch(appLoggerProvider),
  traceIds: ref.watch(traceIdsProvider),
  platform: ref.watch(devicePlatformProvider),
);

/// Registers this installation.
@Riverpod(keepAlive: true)
RegisterDevice registerDevice(Ref ref) => RegisterDevice(ref.watch(deviceRepositoryProvider));

/// Forgets this installation's push token, on the backend.
@Riverpod(keepAlive: true)
ForgetPushToken forgetPushToken(Ref ref) => ForgetPushToken(ref.watch(deviceRepositoryProvider));

/// Reads where this installation stands.
@Riverpod(keepAlive: true)
CheckDevice checkDevice(Ref ref) => CheckDevice(ref.watch(deviceRepositoryProvider));
