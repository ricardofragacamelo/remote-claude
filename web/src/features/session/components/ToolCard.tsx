import { useTranslation } from 'react-i18next';

import type { ToolExecution } from '../types/live-session';

export interface ToolCardProps {
  readonly tool: ToolExecution;
}

/**
 * One tool, running on the user's own machine.
 *
 * **The command is shown exactly.** Monospaced and scrollable, never truncated: somebody watching
 * a command run on their laptop is entitled to see the command, and an ellipsis in the middle of a
 * shell line hides precisely the part that would have made them stop it.
 */
export function ToolCard({ tool }: ToolCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const command = commandOf(tool.input);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-medium">{tool.toolName}</span>
        <span className="text-xs opacity-70">{t(`session.toolStatus.${tool.status}`)}</span>
      </div>

      {command !== null && (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
          {command}
        </pre>
      )}

      {tool.output.length > 0 && (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
          {tool.output}
        </pre>
      )}

      {tool.summary !== null && <p className="text-xs opacity-70">{tool.summary}</p>}
    </li>
  );
}

/** The fields a tool names its subject by, in the order they are looked for. */
const SUBJECTS = ['command', 'file_path', 'path', 'pattern', 'url'] as const;

/** What this invocation is about, as a person would read it — or `null` when nothing names it. */
function commandOf(input: Readonly<Record<string, unknown>>): string | null {
  for (const field of SUBJECTS) {
    const value = input[field];

    if (typeof value === 'string') {
      return value;
    }
  }

  // Nothing recognisable, so the whole input goes on screen rather than a blank: what executes is
  // what is shown, and "we could not summarise it" is not a reason to show less.
  const keys = Object.keys(input);
  return keys.length === 0 ? null : JSON.stringify(input, null, 2);
}
