/// Commands and undo points, built for a test.
library;

import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// A menu as an installation that offers `/init`, `/review` and `/compact` answers it.
const CommandMenu aMenu = CommandMenu(
  cliVersion: '2.1.277',
  commands: <SlashCommand>[
    SlashCommand(
      name: 'init',
      description: 'Initialize a new CLAUDE.md file with codebase documentation',
      suggested: true,
    ),
    SlashCommand(
      name: 'review',
      description: 'Review a pull request',
      argumentHint: '[pr-number]',
      suggested: true,
    ),
    SlashCommand(
      name: 'compact',
      description: 'Clear conversation history but keep a summary',
      aliases: <String>['squash'],
    ),
  ],
);

/// When the turn of the builders' point began.
final DateTime pointAt = DateTime.utc(2026, 9, 26, 12);

/// An undo point that restores one file, deletes another, keeps a third and finds a fourth as it
/// was — every row the confirmation has.
Checkpoint aCheckpoint({
  String promptId = 'prompt-1',
  String? label = 'refactor the parser',
  List<RevertedFile> toRevert = const <RevertedFile>[
    RevertedFile(path: '/home/someone/project/a.ts', action: RevertAction.restore),
    RevertedFile(path: '/home/someone/project/new.ts', action: RevertAction.delete),
  ],
  List<PreservedFile> toPreserve = const <PreservedFile>[
    PreservedFile(path: '/home/someone/project/b.ts', reason: PreserveReason.modifiedOutside),
  ],
  List<String> unchanged = const <String>['/home/someone/project/c.ts'],
}) => Checkpoint(
  promptId: promptId,
  label: label,
  at: pointAt,
  toRevert: toRevert,
  toPreserve: toPreserve,
  unchanged: unchanged,
);

/// What an undo to [promptId] did.
RewindOutcome anOutcome({String promptId = 'prompt-1', List<String> failed = const <String>[]}) =>
    RewindOutcome(
      promptId: promptId,
      reverted: const <RevertedFile>[
        RevertedFile(path: '/home/someone/project/a.ts', action: RevertAction.restore),
        RevertedFile(path: '/home/someone/project/new.ts', action: RevertAction.delete),
      ],
      preserved: const <PreservedFile>[
        PreservedFile(path: '/home/someone/project/b.ts', reason: PreserveReason.modifiedOutside),
      ],
      unchanged: const <String>['/home/someone/project/c.ts'],
      failed: failed,
    );

/// The wire of a `session.rewound` payload for [outcome].
Map<String, Object?> rewoundPayload({
  String promptId = 'prompt-1',
  List<String> failed = const <String>[],
}) => <String, Object?>{
  'promptId': promptId,
  'reverted': <Object?>[
    <String, Object?>{'path': '/home/someone/project/a.ts', 'action': 'restored'},
    <String, Object?>{'path': '/home/someone/project/new.ts', 'action': 'deleted'},
  ],
  'preserved': <Object?>[
    <String, Object?>{'path': '/home/someone/project/b.ts', 'reason': 'modifiedOutside'},
  ],
  'unchanged': <Object?>[
    <String, Object?>{'path': '/home/someone/project/c.ts'},
  ],
  'failed': <Object?>[
    for (final String path in failed) <String, Object?>{'path': path},
  ],
};
