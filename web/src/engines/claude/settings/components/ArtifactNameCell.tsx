import { useNavigate } from '@tanstack/react-router';

import { workbenchLocation } from '@/app/workbench-location';

export interface ArtifactNameCellProps {
  readonly folder: string;
  /** `null` for an item this folder's own allowlist cannot reach — no link, plain text instead. */
  readonly sourceFile: string | null;
  readonly label: string;
}

/**
 * A command's, a subagent's or an output style's own name cell: a link to its file in the editor
 * when the folder can reach it, plain text otherwise — the same choice every list of this kind makes
 * (plan 13, B-33, B-36, B-37).
 */
export function ArtifactNameCell({
  folder,
  sourceFile,
  label,
}: ArtifactNameCellProps): React.JSX.Element {
  const navigate = useNavigate();

  if (sourceFile === null) {
    return <>{label}</>;
  }

  return (
    <button
      type="button"
      className="underline"
      onClick={() => {
        void navigate({ href: workbenchLocation({ folder, file: sourceFile }) });
      }}
    >
      {label}
    </button>
  );
}
