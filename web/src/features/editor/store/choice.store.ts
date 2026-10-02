import { create } from 'zustand';

/** One option of a choice the palette offers — a language, an encoding, a line ending. */
export interface ChoiceOption {
  readonly id: string;

  /** Translated, or a proper name. */
  readonly label: string;

  /** The value in use now — marked in the list. */
  readonly current: boolean;
  run(): void;
}

/** The choice on offer, while the palette shows it. */
export interface ChoiceState {
  /** What the choice is about — a translation key, named in full where the choice is made. */
  readonly titleKey: string;
  readonly options: readonly ChoiceOption[];
  offer(titleKey: string, options: readonly ChoiceOption[]): void;
}

/**
 * The choice an editor command offers in the palette — the same one the status bar item opens
 * (B-37): the palette shows it in its "choice" mode, entered by name.
 */
export const useEditorChoice = create<ChoiceState>((set) => ({
  titleKey: 'editor.choice.placeholder',
  options: [],
  offer: (titleKey, options) => {
    set({ titleKey, options });
  },
}));
