/// The permission feature's public face.
///
/// Another feature imports **this** file and nothing deeper. A deep path into `data/` is what
/// turns two features into one tangle, and the architecture rule refuses it.
library;

export 'domain/entities/permission_outcome.dart';
export 'domain/entities/permission_queue.dart';
export 'domain/entities/permission_request.dart';
export 'presentation/pages/permission_page.dart';
export 'presentation/pages/rules_page.dart';
export 'presentation/providers/permission_queue_controller.dart';
export 'presentation/widgets/approval_lock_switch.dart';
export 'presentation/widgets/permission_outcome_line.dart';
export 'presentation/widgets/permission_panel.dart';
