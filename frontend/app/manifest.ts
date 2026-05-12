import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LinguaReader",
    short_name: "LinguaReader",
    description:
      "Lee en inglés, escuchá nativos pronunciar cada palabra, y repasá con SRS.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EDE3D0",
    theme_color: "#C77B5F",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
