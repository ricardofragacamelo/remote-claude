/// The device feature's public face.
///
/// Another feature imports **this** file and nothing deeper. A deep path into `data/` is what
/// turns two features into one tangle, and the architecture rule refuses it.
library;

export 'domain/entities/registered_device.dart';
export 'presentation/providers/device_controller.dart';
export 'presentation/providers/push_controller.dart';
export 'presentation/widgets/device_status_banner.dart';
export 'presentation/widgets/push_reach_banner.dart';
