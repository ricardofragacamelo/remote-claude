/// Reads a `GET /sessions/:sessionId/tools/:toolUseId/diff` body as [ToolDiff] — the generated
/// [ToolDiffPayload] is the wire, kept out of the domain layer the way every other mapper in this
/// feature keeps its own wire out of it.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';

/// [body] as a [ToolDiff], or `null` when it is not a diff this build can read.
ToolDiff? toolDiffFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  try {
    final ToolDiffPayload payload = ToolDiffPayload.fromJson(body);

    return ToolDiff(
      path: payload.path,
      hunks: <DiffHunk>[for (final ToolDiffPayloadHunksItem hunk in payload.hunks) _hunkFrom(hunk)],
    );
  } on TypeError {
    return null;
  }
}

/// [hunk]'s lines, numbered on each side as they run from [ToolDiffPayloadHunksItem.oldStart] and
/// [ToolDiffPayloadHunksItem.newStart] — context advances both, an addition only the new side, a
/// removal only the old one, as a unified diff's own convention has it.
DiffHunk _hunkFrom(ToolDiffPayloadHunksItem hunk) {
  int oldLine = hunk.oldStart;
  int newLine = hunk.newStart;
  final List<DiffLine> lines = <DiffLine>[];

  for (final ToolDiffPayloadHunksItemLinesItem line in hunk.lines) {
    switch (line.kind) {
      case 'added':
        lines.add(DiffLine(kind: DiffLineKind.added, text: line.text, newLine: newLine));
        newLine += 1;
      case 'removed':
        lines.add(DiffLine(kind: DiffLineKind.removed, text: line.text, oldLine: oldLine));
        oldLine += 1;
      default:
        lines.add(
          DiffLine(kind: DiffLineKind.context, text: line.text, oldLine: oldLine, newLine: newLine),
        );
        oldLine += 1;
        newLine += 1;
    }
  }

  return DiffHunk(id: hunk.id, lines: lines);
}
