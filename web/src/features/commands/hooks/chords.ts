import type { Keybinding, ShortcutLabel } from '../types/command';

/** A key and the modifiers held with it. */
interface Chord {
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly key: string;
}

/** Whether the browser runs on a Mac, where the command key does what control does elsewhere. */
export function onMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

const MODIFIERS: Readonly<Record<string, (mac: boolean) => Partial<Chord>>> = {
  mod: (mac) => (mac ? { meta: true } : { ctrl: true }),
  ctrl: () => ({ ctrl: true }),
  alt: () => ({ alt: true }),
  shift: () => ({ shift: true }),
  cmd: () => ({ meta: true }),
  meta: () => ({ meta: true }),
};

/** A single character is a letter or a digit, and is written in capitals: `P`, not `p`. */
function keyName(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * A chord as it is written — `Mod+Shift+P` — read for one platform.
 *
 * @throws {Error} a chord with no key, or a modifier this module does not know: a typo in a
 *   declaration is a bug to see at load, not a shortcut that silently never fires
 */
function parse(text: string, mac: boolean): Chord {
  const parts = text.split('+');
  const key = parts.pop();

  if (key === undefined || key === '') {
    throw new Error(`shortcut "${text}" names no key`);
  }

  return parts.reduce<Chord>(
    (chord, part) => {
      const modifier = MODIFIERS[part.toLowerCase()];

      if (modifier === undefined) {
        throw new Error(`shortcut "${text}" has an unknown modifier "${part}"`);
      }

      return { ...chord, ...modifier(mac) };
    },
    { ctrl: false, alt: false, shift: false, meta: false, key: keyName(key) },
  );
}

/** The modifiers, in the order every spelling of a chord writes them. */
const MODIFIER_ORDER = [
  { held: 'ctrl', word: 'Ctrl', aria: 'Control', symbol: '⌃' },
  { held: 'alt', word: 'Alt', aria: 'Alt', symbol: '⌥' },
  { held: 'shift', word: 'Shift', aria: 'Shift', symbol: '⇧' },
  { held: 'meta', word: 'Meta', aria: 'Meta', symbol: '⌘' },
] as const;

/** The modifiers a chord holds, in order. */
function heldIn(chord: Chord): (typeof MODIFIER_ORDER)[number][] {
  return MODIFIER_ORDER.filter((modifier) => chord[modifier.held]);
}

/** One spelling per chord, so two ways of writing the same one compare equal. */
function canonical(chord: Chord): string {
  return [...heldIn(chord).map((modifier) => modifier.word), chord.key].join('+');
}

/**
 * The chords of a binding as it is written for one platform — one, or a sequence separated by a
 * space: `Mod+K S` is `Mod+K`, let go, then `S`.
 */
function partsOf(binding: Pick<Keybinding, 'key' | 'mac'>, mac: boolean): readonly string[] {
  return (mac ? (binding.mac ?? binding.key) : binding.key).split(' ');
}

/**
 * The chord a binding means on one platform — a sequence is its chords in order, separated by a
 * space (`Ctrl+K S`).
 */
export function chordOf(binding: Pick<Keybinding, 'key' | 'mac'>, mac: boolean): string {
  return partsOf(binding, mac)
    .map((part) => canonical(parse(part, mac)))
    .join(' ');
}

/**
 * The key an event is, as a binding names it.
 *
 * Letters and digits come from the **physical** key: on a Mac, `Alt+1` types `¡` and `Shift+P`
 * types `P`, and a binding names the key, not what it typed.
 */
function keyOfEvent(event: KeyboardEvent): string {
  const physical = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code);

  return physical === null ? keyName(event.key) : (physical[1] ?? physical[2] ?? event.key);
}

/** The chord a key press is. */
export function chordOfEvent(event: KeyboardEvent): string {
  return canonical({
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: keyOfEvent(event),
  });
}

/**
 * The chords the browser keeps for itself outside an installed app: the page does not get them, or
 * gets them and cannot stop the browser from acting
 * ([06 · D-16](../../../../../docs/plans/06-workbench/decisions.md#d-16--atalhos-que-o-navegador-reserva)).
 * A default shortcut on one of them is refused at registration.
 */
const RESERVED: Readonly<Record<'other' | 'mac', readonly string[]>> = {
  other: [
    'Ctrl+Tab',
    'Ctrl+Shift+Tab',
    'Ctrl+W',
    'Ctrl+T',
    'Ctrl+N',
    'Ctrl+PageUp',
    'Ctrl+PageDown',
  ],
  mac: ['Ctrl+Tab', 'Ctrl+Shift+Tab', 'Meta+W', 'Meta+T', 'Meta+N'],
};

/** The platform whose browser keeps the chord a binding means there, if any. */
export function reservedIn(binding: Pick<Keybinding, 'key' | 'mac'>): 'other' | 'mac' | null {
  // A sequence starts with its first chord: a browser that keeps that one never lets it begin.
  const first = (mac: boolean): string => chordOf(binding, mac).split(' ')[0] ?? '';

  if (RESERVED.other.includes(first(false))) {
    return 'other';
  }

  return RESERVED.mac.includes(first(true)) ? 'mac' : null;
}

/** How a key is written for a person, and for `aria-keyshortcuts`. */
const KEY_LABELS: Readonly<Record<string, { readonly label: string; readonly aria: string }>> = {
  ArrowLeft: { label: '←', aria: 'ArrowLeft' },
  ArrowRight: { label: '→', aria: 'ArrowRight' },
  ArrowUp: { label: '↑', aria: 'ArrowUp' },
  ArrowDown: { label: '↓', aria: 'ArrowDown' },
};

/**
 * A binding, written for the platform: `Ctrl+Shift+P` away from a Mac, `⇧⌘P` on one — the way each
 * platform's own menus write it.
 */
export function shortcutLabel(
  binding: Pick<Keybinding, 'key' | 'mac'>,
  mac: boolean,
): ShortcutLabel {
  const chords = partsOf(binding, mac).map((part) => {
    const chord = parse(part, mac);
    const key = KEY_LABELS[chord.key] ?? { label: chord.key, aria: chord.key };
    const held = heldIn(chord);

    return {
      label: mac
        ? [...held.map((modifier) => modifier.symbol), key.label].join('')
        : [...held.map((modifier) => modifier.word), key.label].join('+'),
      aria: [...held.map((modifier) => modifier.aria), key.aria].join('+'),
    };
  });

  return {
    label: chords.map((chord) => chord.label).join(' '),
    // `aria-keyshortcuts` separates **alternatives** with a space and has no way to say "then": a
    // sequence is announced by its label only, never as two shortcuts it is not.
    aria: chords.length === 1 ? (chords[0]?.aria ?? '') : '',
  };
}
