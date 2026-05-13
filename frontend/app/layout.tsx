import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { AppBadgeSync } from "@/components/pwa/app-badge-sync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  // Placeholder production URL — swap to the real domain when known. Required
  // so Next resolves opengraph-image / twitter-image into absolute URLs for
  // social previews (Twitter/X, Facebook, Telegram, WhatsApp, Reddit, etc.).
  metadataBase: new URL("https://linguareader.app"),
  title: {
    default: "LinguaReader — Aprende inglés sin dejar de leer lo que amas",
    template: "%s · LinguaReader",
  },
  description:
    "Lee libros, artículos, videos. Captura palabras sin romper el flow. Tu biblioteca te recuerda.",
  keywords: [
    "aprender inglés",
    "lectura en inglés",
    "pronunciación",
    "spaced repetition",
    "extensión navegador",
    "EPUB",
    "subtítulos",
  ],
  applicationName: "LinguaReader",
  appleWebApp: {
    capable: true,
    title: "LinguaReader",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "LinguaReader — Aprende inglés sin dejar de leer lo que amas",
    description: "Lee. Captura. No olvides.",
    url: "https://linguareader.app",
    siteName: "LinguaReader",
    type: "website",
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinguaReader — Aprende inglés sin dejar de leer lo que amas",
    description: "Lee. Captura. No olvides.",
  },
  robots: { index: true, follow: true },
  // /manifest.webmanifest is served automatically from app/manifest.ts.
  // Next 16 also auto-links app/icon.png + app/apple-icon.png in <head>.
  // Open Graph + Twitter images are auto-wired from app/opengraph-image.tsx
  // and app/landing-preview/{opengraph,twitter}-image.tsx.
};

export const viewport: Viewport = {
  themeColor: "#C77B5F",
  // viewport-fit=cover lets content extend behind the iOS notch / Android nav
  // bar; pair with the .pt-safe / .pb-safe utilities in globals.css when
  // placing content at the edges.
  viewportFit: "cover",
  // initial-scale=1 viewport meta is added by default in Next 16.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <Providers>
            <AppBadgeSync />
            {children}
          </Providers>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
