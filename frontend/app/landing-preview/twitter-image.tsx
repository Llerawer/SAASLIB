// Twitter Card variant — same 1200×630 hero frame as opengraph-image.
// Populates `twitter:image` meta. Re-exports the OG generator to keep both
// images byte-identical and avoid divergence.
export { default, alt, size, contentType } from "./opengraph-image";
