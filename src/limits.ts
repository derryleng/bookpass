// Upper bounds for text that comes from a web page or an imported file, so a hostile one cannot make the vault huge.
// The vault is rewritten whole on every save, so a few megabytes in one bookmark slow every later save.

export const maxTitleLength = 500;
export const maxExcerptLength = 2_000;
/** Notes typed by hand are not limited. Notes that arrive in an imported file are. */
export const maxImportedNoteLength = 10_000;

/** The text cut to at most `max` characters, without leaving half of an emoji at the end. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}
