import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinguaReader — Aprende inglés sin dejar de leer lo que amas",
  description: "Lee. Captura. No olvides.",
};

export default function LandingPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-stage min-h-screen relative overflow-hidden">
      {children}
    </div>
  );
}
