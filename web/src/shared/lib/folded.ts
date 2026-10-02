/**
 * Text as a search compares it: no case, no accents — "abrir" finds "Abrir", "ação" finds "acao".
 * One rule for every search of the product: the palette, the Sessions view.
 */
export function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}
