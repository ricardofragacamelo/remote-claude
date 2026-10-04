/// The workspace feature's public face.
///
/// Another feature imports **this** file and nothing deeper. A deep path into `data/` is what
/// turns two features into one tangle, and the architecture rule refuses it.
library;

export 'domain/entities/folder.dart';
export 'domain/entities/workspace.dart';
export 'presentation/pages/folder_browse_page.dart';
export 'presentation/pages/folder_page.dart';
export 'presentation/pages/folders_page.dart';
export 'presentation/pages/workspace_list_page.dart';
export 'presentation/providers/folders_home_controller.dart';
export 'presentation/providers/workspace_list_controller.dart';
