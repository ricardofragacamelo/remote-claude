/// The transcript feature's public face: the conversations of one workspace.
///
/// Another feature imports **this** file and nothing deeper. Reading one conversation, and
/// resuming it, belong to the session feature — which never imports this one back.
library;

export 'domain/entities/conversation_origin.dart';
export 'domain/entities/conversation_summary.dart';
export 'presentation/pages/conversation_list_page.dart';
export 'presentation/providers/conversation_list_controller.dart';
