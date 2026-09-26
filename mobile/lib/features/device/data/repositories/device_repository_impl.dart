/// The device repository: the wire, turned into the entity the rules work with.
library;

import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/features/device/data/datasources/device_api_data_source.dart';
import 'package:remote_claude/features/device/data/mappers/device_mapper.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';
import 'package:remote_claude/features/device/domain/repositories/device_repository.dart';

/// Which platform this build runs on, as the contract names it.
///
/// Only Android is exercised in this plan; the app still builds for iOS
/// ([D-12](../../../../../docs/plans/02-mobile-approval/decisions.md)).
String platformName(String raw) => raw == 'ios' ? 'ios' : 'android';

/// [DeviceRepository] over the backend's HTTP API.
class DeviceRepositoryImpl implements DeviceRepository {
  const DeviceRepositoryImpl({
    required this._api,
    required this._identity,
    required this._config,
    required this._credentials,
    required this._logger,
    required this._traceIds,
    required this._platform,
  });

  final DeviceApiDataSource _api;
  final DeviceIdentity _identity;
  final AppConfig _config;
  final CredentialSource _credentials;
  final AppLogger _logger;
  final TraceIds _traceIds;
  final String _platform;

  @override
  Future<RegisteredDevice> register({required String name, String? pushToken}) async {
    final String installId = await _identity.ensure();

    final RegisteredDevice? device = deviceFrom(
      await _api.register(<String, Object?>{
        'installId': installId,
        'name': name,
        'platform': platformName(_platform),
        'appVersion': _config.appVersion,
        'locale': _credentials.locale,
        // Absent rather than null: a device with no token still watches sessions, and the
        // contract says so by leaving the field out (S-12).
        'pushToken': ?pushToken,
      }),
    );

    if (device == null) {
      throw ServerFailure(
        code: 'INTERNAL_ERROR',
        messageKey: 'common.error.unexpected',
        traceId: _traceIds.next(),
      );
    }

    // The push token appears as its last six characters and never whole — enough to tell two
    // registrations apart in a log, far too few to reach somebody's phone with (S-14).
    _logger.info(
      'device registered',
      op: LogOp.deviceRegistered,
      fields: <String, Object?>{
        'deviceId': device.id,
        'status': device.status.name,
        'pushEnabled': device.pushEnabled,
        'pushTokenTail': pushTokenTail(pushToken),
      },
    );

    return device;
  }

  @override
  Future<RegisteredDevice> current(String deviceId) async {
    final RegisteredDevice? device = deviceIn(await _api.list(), deviceId);

    if (device == null) {
      throw ServerFailure(
        code: 'NOT_FOUND',
        messageKey: 'auth.error.deviceNotFound',
        traceId: _traceIds.next(),
      );
    }

    _logger.info(
      'device status checked',
      op: LogOp.deviceRegistered,
      fields: <String, Object?>{'deviceId': device.id, 'status': device.status.name},
    );

    return device;
  }
}
