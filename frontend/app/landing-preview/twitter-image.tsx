// Twitter Card variant — same 1200×630 hero frame as opengraph-image.
// Populates `twitter:image` meta. Re-exports the OG generator to keep both
// images byte-identical and avoid divergence. `dynamic` is inlined as a
// literal because Next.js statically parses route segment config and
// won't accept it via re-export.
export const dynamic = "force-dynamic";
export { default, alt, size, contentType } from "./opengraph-image";
