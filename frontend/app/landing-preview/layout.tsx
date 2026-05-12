import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinguaReader — Aprende inglés mientras lees lo que amas",
  description: "Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas.",
};

export default function LandingPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-background text-foreground bg-paper-noise">
      {children}
    </div>
  );
}
