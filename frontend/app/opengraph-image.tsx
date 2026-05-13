// Root-level OG image — shared by `/`. Re-exports the landing-preview generator
// so a link to either URL shows the same hero frame on social previews.
// `dynamic` is inlined as a literal (Next statically parses route config).
export const dynamic = "force-dynamic";
export {
  default,
  alt,
  size,
  contentType,
} from "./landing-preview/opengraph-image";
