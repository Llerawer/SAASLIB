import Link from "next/link";
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";
import { HeroStage } from "@/components/landing/hero-stage";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0">
      <section className="mx-auto max-w-7xl px-6 py-12 md:py-24 grid gap-10 md:gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div className="order-2 md:order-1">
          <HeroStage />
        </div>
        <div className="order-1 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>

      <div
        className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <Link
          href="/signup"
          className="block w-full text-center rounded-md bg-accent text-accent-foreground px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/90"
        >
          Empieza gratis
        </Link>
      </div>
    </main>
  );
}
