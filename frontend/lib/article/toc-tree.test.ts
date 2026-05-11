import { describe, it, expect } from "vitest";

import type { ArticleListItem } from "@/lib/api/queries";
import {
  buildTocTree,
  defaultExpandedPaths,
  getBreadcrumbs,
  getPrevNext,
} from "./toc-tree";

function mkArticle(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: overrides.id ?? "x",
    url: "https://x.com/p",
    title: overrides.title ?? overrides.id ?? "X",
    author: null,
    language: "en",
    word_count: 100,
    fetched_at: "2026-05-09T00:00:00Z",
    read_pct: 0,
    source_id: "src1",
    toc_path: null,
    parent_toc_path: null,
    toc_order: null,
    ...overrides,
  };
}

describe("buildTocTree — basic hierarchy", () => {
  it("groups articles into a tree by toc_path", () => {
    const articles = [
      mkArticle({ id: "a", title: "A", toc_path: "applications/sales", parent_toc_path: "applications", toc_order: 1 }),
      mkArticle({ id: "b", title: "B", toc_path: "applications/inventory", parent_toc_path: "applications", toc_order: 0 }),
    ];
    const tree = buildTocTree(articles);
    // One top-level: "applications" (synthetic since no article at that path)
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("applications");
    expect(tree[0].article).toBeNull();
    expect(tree[0].children).toHaveLength(2);
    // Sorted by toc_order: inventory (0) before sales (1)
    expect(tree[0].children[0].path).toBe("applications/inventory");
    expect(tree[0].children[1].path).toBe("applications/sales");
  });

  it("creates intermediate nodes for ancestors that have no article", () => {
    const articles = [
      mkArticle({ id: "deep", toc_path: "a/b/c/d", parent_toc_path: "a/b/c", toc_order: 0 }),
    ];
    const tree = buildTocTree(articles);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("a");
    expect(tree[0].children[0].path).toBe("a/b");
    expect(tree[0].children[0].children[0].path).toBe("a/b/c");
    expect(tree[0].children[0].children[0].children[0].path).toBe("a/b/c/d");
  });

  it("orphan articles (no toc_path) land in a synthetic '__orphans__' group", () => {
    const articles = [
      mkArticle({ id: "leaf", toc_path: "x", parent_toc_path: null, toc_order: 0 }),
      mkArticle({ id: "orphan1", title: "O1", toc_path: null }),
      mkArticle({ id: "orphan2", title: "O2", toc_path: null }),
    ];
    const tree = buildTocTree(articles);
    const orphanNode = tree.find((n) => n.path === "__orphans__");
    expect(orphanNode).toBeDefined();
    expect(orphanNode!.children.map((c) => c.label)).toEqual(["O1", "O2"]);
  });

  it("uses the article's title as label, not the path segment", () => {
    const articles = [
      mkArticle({ id: "a", title: "Stages of inventory", toc_path: "applications/inventory/stages", toc_order: 0 }),
    ];
    const tree = buildTocTree(articles);
    // Walk down to the leaf node
    const stagesNode = tree[0].children[0].children[0];
    expect(stagesNode.article?.title).toBe("Stages of inventory");
  });
});

describe("getBreadcrumbs", () => {
  it("returns root-to-leaf parent chain (excluding the article itself)", () => {
    const articles = [
      mkArticle({ id: "a", title: "Apps", toc_path: "applications", toc_order: 0 }),
      mkArticle({ id: "s", title: "Sales", toc_path: "applications/sales", parent_toc_path: "applications", toc_order: 0 }),
      mkArticle({ id: "ss", title: "Sales subpage", toc_path: "applications/sales/sub", parent_toc_path: "applications/sales", toc_order: 0 }),
    ];
    const subpage = articles[2];
    const crumbs = getBreadcrumbs(subpage, articles);
    expect(crumbs.map((c) => c.label)).toEqual(["Apps", "Sales"]);
  });

  it("returns empty array when article has no parent_toc_path", () => {
    const a = mkArticle({ id: "x", toc_path: "root", parent_toc_path: null });
    expect(getBreadcrumbs(a, [a])).toEqual([]);
  });

  it("falls back to path segment when no article exists at the parent path", () => {
    const articles = [
      mkArticle({ id: "leaf", toc_path: "a/b/c", parent_toc_path: "a/b", toc_order: 0 }),
    ];
    const leaf = articles[0];
    const crumbs = getBreadcrumbs(leaf, articles);
    // No article at "a" or "a/b", so labels come from path segments.
    expect(crumbs.map((c) => c.label)).toEqual(["a", "b"]);
  });
});

describe("getPrevNext", () => {
  it("returns the prev and next article by toc_order within the same source", () => {
    const articles = [
      mkArticle({ id: "a", source_id: "s", toc_order: 0 }),
      mkArticle({ id: "b", source_id: "s", toc_order: 1 }),
      mkArticle({ id: "c", source_id: "s", toc_order: 2 }),
    ];
    const { prev, next } = getPrevNext(articles[1], articles);
    expect(prev?.id).toBe("a");
    expect(next?.id).toBe("c");
  });

  it("returns null prev for the first article", () => {
    const articles = [
      mkArticle({ id: "a", source_id: "s", toc_order: 0 }),
      mkArticle({ id: "b", source_id: "s", toc_order: 1 }),
    ];
    const { prev, next } = getPrevNext(articles[0], articles);
    expect(prev).toBeNull();
    expect(next?.id).toBe("b");
  });

  it("returns null next for the last article", () => {
    const articles = [
      mkArticle({ id: "a", source_id: "s", toc_order: 0 }),
      mkArticle({ id: "b", source_id: "s", toc_order: 1 }),
    ];
    const { prev, next } = getPrevNext(articles[1], articles);
    expect(prev?.id).toBe("a");
    expect(next).toBeNull();
  });

  it("ignores articles from other sources", () => {
    const articles = [
      mkArticle({ id: "a", source_id: "s1", toc_order: 0 }),
      mkArticle({ id: "b", source_id: "s2", toc_order: 0 }),
      mkArticle({ id: "c", source_id: "s1", toc_order: 1 }),
    ];
    const { prev, next } = getPrevNext(articles[2], articles);
    expect(prev?.id).toBe("a");
    expect(next).toBeNull();
  });
});

describe("defaultExpandedPaths", () => {
  it("returns every ancestor path + the article's own path", () => {
    const a = mkArticle({ toc_path: "a/b/c/d" });
    const expanded = defaultExpandedPaths(a);
    expect([...expanded].sort()).toEqual(["a", "a/b", "a/b/c", "a/b/c/d"]);
  });

  it("returns empty set for an article with no toc_path", () => {
    const a = mkArticle({ toc_path: null });
    expect(defaultExpandedPaths(a).size).toBe(0);
  });
});
