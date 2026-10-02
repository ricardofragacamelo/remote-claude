import { describe, expect, it } from 'vitest';

import { ansiSegments, withoutAnsi } from '@/features/session/lib/ansi';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe('the output of a terminal, read as text with colour — plan 08 B-18', () => {
  it('keeps plain text as one plain run', () => {
    expect(ansiSegments('all good')).toEqual([{ text: 'all good', tone: null, bold: false }]);
  });

  it('turns each colour into a role of the theme, never a literal colour — S-77', () => {
    const output = `${ESC}[31mred${ESC}[0m ${ESC}[32mgreen${ESC}[39m ${ESC}[93mwarn${ESC}[m`;

    expect(ansiSegments(output)).toEqual([
      { text: 'red', tone: 'danger', bold: false },
      { text: ' ', tone: null, bold: false },
      { text: 'green', tone: 'success', bold: false },
      { text: ' ', tone: null, bold: false },
      { text: 'warn', tone: 'warning', bold: false },
    ]);
  });

  it('reads bold on and off, and several codes in one sequence', () => {
    expect(ansiSegments(`${ESC}[1;34mbold blue${ESC}[22m blue`)).toEqual([
      { text: 'bold blue', tone: 'accent', bold: true },
      { text: ' blue', tone: 'accent', bold: false },
    ]);
  });

  it('ignores a colour code it does not know, keeping the style it had', () => {
    expect(ansiSegments(`${ESC}[31m${ESC}[48;5;200mstill red`)).toEqual([
      { text: 'still red', tone: 'danger', bold: false },
    ]);
  });

  it('drops a terminal hyperlink, keeping only its text — S-78', () => {
    const output = `see ${ESC}]8;;https://evil.example${BEL}here${ESC}]8;;${BEL} now`;

    expect(withoutAnsi(output)).toBe('see here now');
    expect(ansiSegments(output).map((segment) => segment.text)).not.toContain(
      'https://evil.example',
    );
  });

  it('drops a window title ended by the string terminator — S-78', () => {
    expect(withoutAnsi(`${ESC}]0;pwned${ESC}\\after`)).toBe('after');
  });

  it('drops cursor moves, erases and unknown two-character escapes — S-78', () => {
    expect(withoutAnsi(`a${ESC}[2Kb${ESC}[?25lc${ESC}Md`)).toBe('abcd');
  });

  it('drops an OSC left open at the end of the output', () => {
    expect(withoutAnsi(`done${ESC}]0;never closed`)).toBe('done');
  });

  it('gives nothing for an empty output', () => {
    expect(ansiSegments('')).toEqual([]);
  });
});
