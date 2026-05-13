import { ImageResponse } from "next/og";

export const alt =
  "LinguaReader — Aprende inglés sin dejar de leer lo que amas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generate on-demand instead of prerendering at build time. The build
// was failing in satori (`Cannot read properties of undefined (reading
// '256')`) when GitHub raw-font fetches returned HTML 404s. Dynamic
// generation runs at request time, so the OG crawler triggers a fresh
// fetch with proper network conditions; cached after the first hit.
export const dynamic = "force-dynamic";

// Colors that match the hero's warm-dark / cream identity.
const BG = "#211814";
const INK = "#F5EFE2";
const INK_MUTED = "rgba(245, 239, 226, 0.62)";
const TERRACOTA = "#C77B5F";
const CREAM = "#F7EFE0";
const CREAM_INK = "#3A2E26";
const CREAM_INK_MUTED = "#7A6B5D";
const GLIMPSE_BG = "rgba(199, 123, 95, 0.18)";

async function tryFetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    // GitHub raw URLs sometimes redirect to an HTML 404 page that
    // returns 200 OK with text/html. Satori then crashes deep inside
    // its TTF parser ("Cannot read properties of undefined (reading
    // '256')"). Gate on a font-like content-type so non-binary
    // responses bail out cleanly and the build falls back to system
    // fonts.
    if (!ct.includes("font") && !ct.includes("octet-stream")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1024) return null; // sanity: real fonts are >> 1KB
    return buf;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  // Best-effort font loading. If any fetch fails (sandbox / offline build),
  // ImageResponse falls back to the bundled system sans — layout stays intact.
  const [serifItalic, serifBold, bricolage] = await Promise.all([
    tryFetchFont(
      "https://github.com/google/fonts/raw/main/ofl/sourceserif4/SourceSerif4-Italic%5Bopsz%2Cwght%5D.ttf",
    ),
    tryFetchFont(
      "https://github.com/google/fonts/raw/main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf",
    ),
    tryFetchFont(
      "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
    ),
  ]);

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    style?: "normal" | "italic";
    weight?: 400 | 500 | 600 | 700;
  }> = [];
  if (bricolage)
    fonts.push({
      name: "Bricolage Grotesque",
      data: bricolage,
      style: "normal",
      weight: 500,
    });
  if (serifBold)
    fonts.push({
      name: "Source Serif 4",
      data: serifBold,
      style: "normal",
      weight: 600,
    });
  if (serifItalic)
    fonts.push({
      name: "Source Serif 4",
      data: serifItalic,
      style: "italic",
      weight: 400,
    });

  const sansStack =
    '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif';
  const serifStack =
    '"Source Serif 4", Georgia, "Iowan Old Style", serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: INK,
          fontFamily: sansStack,
          position: "relative",
          padding: "64px 72px",
          overflow: "hidden",
        }}
      >
        {/* Warm terracota radial glow behind the panel area */}
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "55%",
            width: 900,
            height: 900,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(closest-side, rgba(199,123,95,0.22), rgba(199,123,95,0) 70%)",
            display: "flex",
          }}
        />
        {/* Secondary cooler glow lower-left for depth */}
        <div
          style={{
            position: "absolute",
            top: "85%",
            left: "10%",
            width: 600,
            height: 600,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(closest-side, rgba(120,90,70,0.18), rgba(0,0,0,0) 70%)",
            display: "flex",
          }}
        />

        {/* Top row: brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: TERRACOTA,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CREAM,
              fontFamily: serifStack,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: -0.5,
            }}
          >
            Lr
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: INK,
              letterSpacing: -0.3,
              display: "flex",
            }}
          >
            LinguaReader
          </div>
        </div>

        {/* Main two-column composition */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 48,
            marginTop: 28,
            zIndex: 2,
          }}
        >
          {/* Left column: headline + subhead */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: 540,
            }}
          >
            <div
              style={{
                fontSize: 62,
                lineHeight: 1.04,
                fontWeight: 500,
                letterSpacing: -1.6,
                color: INK,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ display: "flex" }}>Aprende inglés</span>
              <span style={{ display: "flex" }}>sin dejar de leer</span>
              <span style={{ display: "flex" }}>lo que amas.</span>
            </div>
            <div
              style={{
                marginTop: 26,
                fontFamily: serifStack,
                fontStyle: "italic",
                fontSize: 30,
                color: TERRACOTA,
                letterSpacing: -0.2,
                display: "flex",
              }}
            >
              Lee. Captura. No olvides.
            </div>
          </div>

          {/* Right column: book panel mockup */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              transform: "rotate(-1.6deg)",
            }}
          >
            {/* Stacked mazo cards (behind, peeking from right) */}
            <div
              style={{
                position: "absolute",
                right: -54,
                bottom: -30,
                width: 120,
                height: 168,
                borderRadius: 14,
                background: "#E8DDC8",
                transform: "rotate(8deg)",
                boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                display: "flex",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: -38,
                bottom: -18,
                width: 120,
                height: 168,
                borderRadius: 14,
                background: "#F0E4CE",
                transform: "rotate(4deg)",
                boxShadow: "0 14px 30px rgba(0,0,0,0.4)",
                display: "flex",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: -22,
                bottom: -8,
                width: 120,
                height: 168,
                borderRadius: 14,
                background: CREAM,
                transform: "rotate(1deg)",
                boxShadow: "0 16px 32px rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                padding: 14,
                color: CREAM_INK,
                fontFamily: serifStack,
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              128
            </div>

            {/* Cream book panel */}
            <div
              style={{
                width: 520,
                background: CREAM,
                borderRadius: 18,
                padding: "26px 30px 30px",
                display: "flex",
                flexDirection: "column",
                boxShadow:
                  "0 30px 60px rgba(0,0,0,0.45), 0 6px 16px rgba(0,0,0,0.25)",
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Chapter eyebrow */}
              <div
                style={{
                  fontFamily: serifStack,
                  fontStyle: "italic",
                  fontSize: 16,
                  color: CREAM_INK_MUTED,
                  letterSpacing: 0.6,
                  display: "flex",
                }}
              >
                capítulo i · glimpse
              </div>

              {/* Paragraph */}
              <div
                style={{
                  marginTop: 18,
                  fontFamily: serifStack,
                  fontSize: 24,
                  lineHeight: 1.5,
                  color: CREAM_INK,
                  display: "flex",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "flex" }}>She caught a&nbsp;</span>
                <span
                  style={{
                    display: "flex",
                    background: GLIMPSE_BG,
                    color: CREAM_INK,
                    padding: "0 6px",
                    borderRadius: 4,
                    borderBottom: `2px solid ${TERRACOTA}`,
                  }}
                >
                  glimpse
                </span>
                <span style={{ display: "flex" }}>
                  &nbsp;of him through the rain,
                </span>
                <span style={{ display: "flex" }}>
                  and for a moment the world
                </span>
                <span style={{ display: "flex" }}>
                  stilled around them.
                </span>
              </div>

              {/* Pronunciation popup */}
              <div
                style={{
                  marginTop: 24,
                  alignSelf: "flex-end",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#FFFFFF",
                  border: `1px solid ${TERRACOTA}`,
                  borderRadius: 999,
                  padding: "10px 18px",
                  boxShadow: "0 8px 18px rgba(58,46,38,0.18)",
                  color: CREAM_INK,
                }}
              >
                <span
                  style={{
                    fontFamily: serifStack,
                    fontStyle: "italic",
                    fontSize: 20,
                    color: CREAM_INK,
                    display: "flex",
                  }}
                >
                  /ɡlɪmps/
                </span>
                {/* Play triangle */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: TERRACOTA,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polygon points="2,1 11,6 2,11" fill={CREAM} />
                  </svg>
                </div>
                {/* Waveform stub */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  {[10, 16, 8, 18, 12, 6].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        height: h,
                        borderRadius: 2,
                        background: TERRACOTA,
                        opacity: 0.7,
                        display: "flex",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row: tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            zIndex: 2,
            fontSize: 20,
            color: INK_MUTED,
            letterSpacing: 0.4,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ display: "flex", color: INK }}>LinguaReader</span>
            <span style={{ display: "flex", color: INK_MUTED }}>·</span>
            <span style={{ display: "flex" }}>lectura</span>
            <span style={{ display: "flex", color: INK_MUTED }}>·</span>
            <span style={{ display: "flex" }}>pronunciación</span>
            <span style={{ display: "flex", color: INK_MUTED }}>·</span>
            <span style={{ display: "flex" }}>memoria</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: serifStack,
              fontStyle: "italic",
              color: TERRACOTA,
              fontSize: 20,
            }}
          >
            linguareader.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
