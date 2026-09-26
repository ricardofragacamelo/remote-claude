/// The workspace feature's public face.
///
/// Another feature imports **this** file and nothing deeper. A deep path into `data/` is what
/// turns two features into one tangle, and the architecture rule refuses it.
library;

export 'domain/entities/workspace.dart';
export 'presentation/pages/workspace_list_page.dart';
export 'presentation/providers/workspace_list_controller.dart';
