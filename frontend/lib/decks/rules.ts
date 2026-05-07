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

const HUE_PALETTE = [0, 15, 175, 200, 215, 230, 250, 270, 290, 310, 330, 350];

export function derivedHueForName(name: string): number {
  // FNV-1a 32-bit, reused from lib/srs/variants.ts pattern.
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const idx = Math.abs(hash) % HUE_PALETTE.length;
  return HUE_PALETTE[idx]!;
}
