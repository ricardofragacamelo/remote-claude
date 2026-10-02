import type { ViewOptions } from '../types/code-editor';
import type { EditorFont, EditorPreferences, Indentation } from '../types/editor';

/** The fonts each choice is — written out, because the editor measures them and cannot read a token. */
const FONT_FAMILIES: Readonly<Record<EditorFont, string>> = {
  code: "ui-monospace, 'SFMono-Regular', 'Cascadia Code', Menlo, Consolas, monospace",
  browser: 'monospace',
};

/** What a file asks of its view besides the preferences. */
export interface ViewNeeds {
  /** Translated — the accessible name of the editor. */
  readonly label: string;
  readonly light: boolean;
  readonly readOnly: boolean;

  /** The file's own indentation, read from it or converted by hand — over the preferences. */
  readonly indentation: Indentation | null;
}

/** The options of a view: the preferences of every tab (S-257), and what this one file needs. */
export function viewOptionsOf(preferences: EditorPreferences, needs: ViewNeeds): ViewOptions {
  return {
    label: needs.label,
    fontSize: Math.round((preferences.fontSize * preferences.zoom) / 100),
    fontFamily: FONT_FAMILIES[preferences.font],
    tabSize: needs.indentation?.size ?? preferences.tabSize,
    insertSpaces: needs.indentation?.insertSpaces ?? preferences.insertSpaces,
    wordWrap: preferences.wordWrap,
    minimap: preferences.minimap,
    readOnly: needs.readOnly,
    light: needs.light,
  };
}
