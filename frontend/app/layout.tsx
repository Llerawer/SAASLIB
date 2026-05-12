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
  title: "LinguaReader",
  description: "Lee en inglés, captura palabras, repasa con SRS.",
  applicationName: "LinguaReader",
  appleWebApp: {
    capable: true,
    title: "LinguaReader",
    statusBarStyle: "default",
  },
  // /manifest.webmanifest is served automatically from app/manifest.ts.
  // Next 16 also auto-links app/icon.png + app/apple-icon.png in <head>.
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
