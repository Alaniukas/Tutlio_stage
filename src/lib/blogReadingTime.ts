/** Rough reading time from markdown/plain text (~200 wpm). */
export function estimateReadingMinutes(text: string): number {
  const words = text.replace(/[#>*_`[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
