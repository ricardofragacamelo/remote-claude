/// [FileSaver] over the app's own channel, `remote_claude/save` (plan 25, B-26, D-14) — in the
/// mould of `remote_claude/push`: a method channel with the product's name, and the platform's
/// dialog on the other side. Both edges of the call are logged: the name and the type, never the
/// file's contents.
library;

import 'package:flutter/services.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';

/// The channel's name, the same on both platforms.
const String saveChannelName = 'remote_claude/save';

/// [FileSaver] by method channel.
class ChannelFileSaver implements FileSaver {
  const ChannelFileSaver({
    required this._logger,
    this._channel = const MethodChannel(saveChannelName),
  });

  final AppLogger _logger;
  final MethodChannel _channel;

  @override
  Future<SaveOutcome> save({
    required String temporaryPath,
    required String name,
    required String mimeType,
  }) async {
    _logger.debug(
      'asking the system where to save',
      op: LogOp.filesSave,
      fields: <String, Object?>{'name': name, 'mimeType': mimeType},
    );
    final SaveOutcome outcome = await _ask(temporaryPath, name, mimeType);
    _logger.debug(
      'the system answered the save',
      op: LogOp.filesSave,
      fields: <String, Object?>{
        'outcome': outcome.runtimeType.toString(),
        if (outcome case SaveFailed(:final String reason)) 'reason': reason,
      },
    );
    return outcome;
  }

  Future<SaveOutcome> _ask(String temporaryPath, String name, String mimeType) async {
    try {
      final String? answer = await _channel.invokeMethod<String>('save', <String, String>{
        'path': temporaryPath,
        'name': name,
        'type': mimeType,
      });
      return switch (answer) {
        'saved' => const Saved(),
        'cancelled' => const SaveCancelled(),
        _ => SaveFailed('unexpected answer: $answer'),
      };
    } on PlatformException catch (error) {
      return SaveFailed('${error.code}: ${error.message ?? ''}');
    } on MissingPluginException {
      return const SaveFailed('no save channel on this platform');
    }
  }
}
