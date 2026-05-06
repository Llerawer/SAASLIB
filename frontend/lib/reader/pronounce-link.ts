export function pronounceHref(word: string): string {
  return `/pronounce/${encodeURIComponent(word.trim().toLowerCase())}`;
}
