/// The file browser's public face (plan 25).
///
/// Another feature imports **this** file and nothing deeper. The browser only reads: nothing in
/// it writes to the folder, and a test refuses the code that would (B-07).
library;

export 'presentation/pages/file_viewer_page.dart' show FileViewerPage;
export 'presentation/widgets/files_panel.dart' show FilesPanel;
