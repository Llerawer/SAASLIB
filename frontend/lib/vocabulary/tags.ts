/**
 * Vocab capture tags — semantic tones for visual differentiation when
 * scanning the inbox. Each tag carries a different cognitive role:
 *
 *  - MNEMO: memory aids (warm/accent — feels like a lightbulb)
 *  - EJEMPLOS: usage examples (cool blue — reference)
 *  - GRAMATICA: structural rules (green — system)
 *  - ETIMOLOGIA: word origins (warm amber — heritage)
 */

export const TAG_OPTIONS = [
  "MNEMO",
  "EJEMPLOS",
  "GRAMATICA",
  "ETIMOLOGIA",
] as const;

export type TagOption = (typeof TAG_OPTIONS)[number];

const TAG_TONE: Record<string, string> = {
  MNEMO: "bg-accent/15 text-accent border-accent/30",
  EJEMPLOS: "bg-info/10 text-info border-info/30",
  GRAMATICA: "bg-success/10 text-success border-success/30",
  ETIMOLOGIA: "bg-warning/15 text-warning-foreground border-warning/40",
};

export function tagTone(tag: string): string {
  return TAG_TONE[tag] ?? "bg-muted text-muted-foreground border-border";
}

const TAG_ORDER: Record<string, number> = Object.fromEntries(
  TAG_OPTIONS.map((t, i) => [t, i]),
);

/**
 * Sort tags by canonical order (defined in TAG_OPTIONS) so the same set
 * always renders in the same visual sequence across rows.
 */
export function sortTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const ia = TAG_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
    const ib = TAG_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}
