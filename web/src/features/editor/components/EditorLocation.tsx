import { useEditorLocation } from '../hooks/useEditorLocation';

export interface EditorLocationProps {
  readonly folder: string;

  /** The `file=` of the address, relative to the folder. */
  readonly file: string | undefined;

  /** Writes the active file to the address. Has to be stable across renders. */
  onFile(file: string | null): void;
}

/**
 * Keeps the active file of a folder tab and the address in step — rendered by the route beside the
 * workbench of the folder, since the editor never learns that a router exists. Shows nothing.
 */
export function EditorLocation({ folder, file, onFile }: EditorLocationProps): null {
  useEditorLocation(folder, file, onFile);
  return null;
}
