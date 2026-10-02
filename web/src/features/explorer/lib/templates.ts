/**
 * The templates of "New from template" — a set built into the web, reviewed as code
 * ([07 · D-19](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-19--de-onde-vêm-os-modelos)).
 *
 * Creating from one is an ordinary `POST /files` with the text it starts with: the server never knows
 * there was a template. Two markers are resolved first — `${fileName}`, the name without its
 * extension, and `${date}`, the day it was made (S-169). The contents are a file's, not words of the
 * interface: they are not translated.
 */

/** One template. */
export interface FileTemplate {
  readonly id: string;

  /** Its name, translated — named in full so the i18n check sees each key. */
  readonly labelKey: string;

  /** The name the field starts with: the part before the extension is selected, to be typed over. */
  readonly suggestedName: string;
  readonly content: string;
}

export const FILE_TEMPLATES: readonly FileTemplate[] = [
  {
    id: 'markdown',
    labelKey: 'explorer.template.markdown',
    suggestedName: 'notes.md',
    content: '# ${fileName}\n\n_${date}_\n',
  },
  {
    id: 'json',
    labelKey: 'explorer.template.json',
    suggestedName: 'data.json',
    content: '{}\n',
  },
  {
    id: 'typescript',
    labelKey: 'explorer.template.typescript',
    suggestedName: 'module.ts',
    content: 'export {};\n',
  },
  {
    id: 'test',
    labelKey: 'explorer.template.test',
    suggestedName: 'module.spec.ts',
    content:
      "import { describe, expect, it } from 'vitest';\n\n" +
      "describe('${fileName}', () => {\n" +
      "  it('works', () => {\n" +
      '    expect(true).toBe(true);\n' +
      '  });\n' +
      '});\n',
  },
  {
    id: 'gitignore',
    labelKey: 'explorer.template.gitignore',
    suggestedName: '.gitignore',
    content: 'node_modules/\ndist/\ncoverage/\n.env\n',
  },
  {
    id: 'editorconfig',
    labelKey: 'explorer.template.editorconfig',
    suggestedName: '.editorconfig',
    content:
      'root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\nindent_style = space\n' +
      'indent_size = 2\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n',
  },
  {
    id: 'claude',
    labelKey: 'explorer.template.claude',
    suggestedName: 'CLAUDE.md',
    content: '# ${fileName}\n\n<!-- ${date} -->\n',
  },
];

/** A template by id, or `undefined` for one this version does not have. */
export function templateOf(id: string): FileTemplate | undefined {
  return FILE_TEMPLATES.find((template) => template.id === id);
}

/** A name without its extension — the last dot's; a leading dot is part of the name. */
export function baseNameOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** A day as `YYYY-MM-DD`, in the person's own time zone. */
export function dayOf(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The text a file made from `template` starts with, named `name` on `date`. */
export function resolveTemplate(template: FileTemplate, name: string, date: Date): string {
  return template.content
    .replaceAll('${fileName}', baseNameOf(name))
    .replaceAll('${date}', dayOf(date));
}
