import { baseName } from '../lib/paths';

/** A file opened recently, as a line of a menu or of the palette: its name, and where it is. */
export function RecentFileLabel({ path }: { readonly path: string }): React.JSX.Element {
  return (
    <>
      <span>{baseName(path)}</span>
      <span className="font-code text-ui-sm text-muted-foreground">{path}</span>
    </>
  );
}
