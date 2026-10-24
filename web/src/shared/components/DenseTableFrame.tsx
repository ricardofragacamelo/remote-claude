import type { ReactNode } from 'react';

export interface DenseTableFrameProps {
  /** Already translated — the table's accessible name, read only by assistive technology. */
  readonly caption: string;
  readonly children: ReactNode;
}

/**
 * The scrolling wrapper and caption every dense table of a settings screen starts with — `mcp`'s own
 * `McpServerTable` and an engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29,
 * B-34) all open the same way; only the columns and rows differ.
 */
export function DenseTableFrame({ caption, children }: DenseTableFrameProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-ui-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
