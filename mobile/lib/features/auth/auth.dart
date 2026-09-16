/// The auth feature's public face.
///
/// Another feature imports **this** file and nothing deeper. A deep path into `data/` is what
/// turns two features into one tangle, and the architecture rule refuses it.
library;

export 'domain/entities/auth_session.dart';
export 'presentation/pages/sign_in_page.dart';
export 'presentation/providers/auth_controller.dart';
