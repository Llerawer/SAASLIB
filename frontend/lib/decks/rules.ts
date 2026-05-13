export type DeckLite = {
  id: string;
  parent_id: string | null;
  name: string;
  is_inbox: boolean;
};

export type DeckNode = DeckLite & {
  children: DeckNode[];
};

export function buildDeckTree<T extends DeckLite>(decks: T[]): (T & { children: DeckNode[] })[] {
  const byParent = new Map<string | null, T[]>();
  for (const d of decks) {
    const arr = byParent.get(d.parent_id) ?? [];
    arr.push(d);
    byParent.set(d.parent_id, arr);
  }
  function attach(parentId: string | null): (T & { children: DeckNode[] })[] {
    const list = byParent.get(parentId) ?? [];
    list.sort((a, b) => {
      if (a.is_inbox && !b.is_inbox) return -1;
      if (!a.is_inbox && b.is_inbox) return 1;
      return a.name.localeCompare(b.name);
    });
    return list.map((d) => ({ ...d, children: attach(d.id) }) as T & { children: DeckNode[] });
  }
  return attach(null);
}

export function deckPath<T extends DeckLite>(
  roots: (T & { children: DeckNode[] })[],
  deckId: string,
): (T & { children: DeckNode[] })[] {
  for (const root of roots) {
    if (root.id === deckId) return [root];
    const inChild = deckPath(root.children as (T & { children: DeckNode[] })[], deckId);
    if (inChild.length > 0) return [root, ...inChild];
  }
  return [];
}

export function isDescendantOf(
  decks: DeckLite[],
  candidateId: string,
  ancestorId: string,
): boolean {
  if (candidateId === ancestorId) return false;
  const byId = new Map(decks.map((d) => [d.id, d] as const));
  let cur = byId.get(candidateId);
  while (cur && cur.parent_id) {
    if (cur.parent_id === ancestorId) return true;
    cur = byId.get(cur.parent_id);
  }
  return false;
}

// Curated palette for auto-derived deck hues. Spread evenly across the
// color wheel so freshly-named decks get visibly distinct tints, not
// the "everything is blue" effect the previous palette produced
// (8 of its 12 entries sat in the 175°-310° blue/violet range).
//
// Hues that overlap with semantic tokens are skipped on purpose:
//   - 25°-50°: project accent (terracota → amber)
//   - 0°-15°/350°-360°: destructive
// so a deck-coloured surface can't be misread as "this is a CTA" or
// "this is dangerous".
const HUE_PALETTE = [
  70,   // chartreuse
  100,  // lime
  140,  // green
  165,  // teal
  190,  // cyan
  215,  // blue
  240,  // indigo
  270,  // violet
  300,  // magenta
  330,  // hot pink
];

export function derivedHueForName(name: string): number {
  // FNV-1a 32-bit, reused from lib/srs/variants.ts pattern.
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const idx = (hash >>> 0) % HUE_PALETTE.length;
  return HUE_PALETTE[idx]!;
}
