/** A colour of the terminal, as a role of the theme — never a literal colour (web/03). */
export type AnsiTone = 'danger' | 'success' | 'warning' | 'accent' | 'muted';

/** One run of text with how the terminal said to show it. */
export interface AnsiSegment {
  readonly text: string;
  readonly tone: AnsiTone | null;
  readonly bold: boolean;
}

/** The SGR colours the output asks for, by code, as roles. Bright variants read the same. */
const TONES: ReadonlyMap<number, AnsiTone> = new Map([
  [30, 'muted'],
  [31, 'danger'],
  [32, 'success'],
  [33, 'warning'],
  [34, 'accent'],
  [35, 'accent'],
  [36, 'accent'],
  [90, 'muted'],
  [91, 'danger'],
  [92, 'success'],
  [93, 'warning'],
  [94, 'accent'],
  [95, 'accent'],
  [96, 'accent'],
]);

/** The two control characters the sequences are made of: escape, and the bell that ends an OSC. */
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

/**
 * Every escape sequence the output may carry, in one pattern: an OSC (`ESC ]` up to BEL or `ESC \`
 * — a hyperlink, a window title), a CSI (`ESC [` … final byte — colour, cursor, erase), or any other
 * two-character escape. Only the colour of a CSI ending in `m` is kept; everything else is dropped.
 */
const ESCAPE = new RegExp(
  `${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|${ESC}\\[([0-9;?]*)([@-~])|${ESC}[@-Z\\\\-_]`,
  'g',
);

interface Style {
  readonly tone: AnsiTone | null;
  readonly bold: boolean;
}

const PLAIN: Style = { tone: null, bold: false };

/** The style a colour sequence leaves, from the one before it. */
function styled(style: Style, codes: string): Style {
  return codes
    .split(';')
    .map((code) => (code === '' ? 0 : Number(code)))
    .reduce<Style>((current, code) => {
      if (code === 0) return PLAIN;
      if (code === 1) return { ...current, bold: true };
      if (code === 22) return { ...current, bold: false };
      if (code === 39) return { ...current, tone: null };
      return TONES.has(code) ? { ...current, tone: TONES.get(code) ?? null } : current;
    }, style);
}

/**
 * Output of a terminal, as text with colour by role (plan 08, B-18).
 *
 * Never HTML: the segments are text, drawn as text. A hyperlink of the terminal (OSC 8), a window
 * title, a cursor move and any sequence this build does not know are **dropped** — none of them
 * becomes a link, a title or anything but the characters around it (S-78).
 */
export function ansiSegments(output: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style = PLAIN;
  let from = 0;

  const push = (text: string): void => {
    if (text !== '') {
      segments.push({ text, ...style });
    }
  };

  for (const match of output.matchAll(ESCAPE)) {
    push(output.slice(from, match.index));
    from = match.index + match[0].length;

    if (match[2] === 'm') {
      style = styled(style, match[1] ?? '');
    }
  }

  push(output.slice(from));
  return segments;
}

/** The output without a single escape sequence — what "copy" and search read. */
export function withoutAnsi(output: string): string {
  return ansiSegments(output)
    .map((segment) => segment.text)
    .join('');
}
