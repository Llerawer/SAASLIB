import { ImageResponse } from "next/og";

export const alt =
  "LinguaReader — Aprende inglés sin dejar de leer lo que amas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#211814";
const INK = "#F5EFE2";
const INK_MUTED = "rgba(245, 239, 226, 0.62)";
const TERRACOTA = "#C77B5F";
const CREAM = "#F7EFE0";
const CREAM_INK = "#3A2E26";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          color: INK,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: TERRACOTA,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CREAM,
              fontFamily: "Georgia, serif",
              fontSize: 22,
              fontWeight: 600,
              fontStyle: "italic",
            }}
          >
            Lr
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, display: "flex" }}>
            LinguaReader
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 80,
              lineHeight: 1.03,
              fontWeight: 500,
              letterSpacing: -2,
              display: "flex",
              flexDirection: "column",
              color: INK,
            }}
          >
            <span style={{ display: "flex" }}>Aprende inglés</span>
            <span style={{ display: "flex" }}>sin dejar de leer</span>
            <span style={{ display: "flex" }}>lo que amas.</span>
          </div>
          <div
            style={{
              fontSize: 32,
              fontStyle: "italic",
              fontFamily: "Georgia, serif",
              color: TERRACOTA,
              display: "flex",
            }}
          >
            Lee. Captura. No olvides.
          </div>
        </div>

        {/* Bottom thread */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 20,
            color: INK_MUTED,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ display: "flex", color: INK }}>lectura</span>
            <span style={{ display: "flex" }}>·</span>
            <span style={{ display: "flex", color: INK }}>pronunciación</span>
            <span style={{ display: "flex" }}>·</span>
            <span style={{ display: "flex", color: INK }}>memoria</span>
          </div>
          <div
            style={{
              fontStyle: "italic",
              fontFamily: "Georgia, serif",
              color: TERRACOTA,
              display: "flex",
            }}
          >
            linguareader.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

/* Used to suppress unused-variable warnings when iterating on simplified versions. */
void CREAM_INK;
