import { HeroCopyColumn } from "@/components/landing/hero-copy-column";
import { HeroStage } from "@/components/landing/hero-stage";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24 grid gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div className="order-1 md:order-1">
          <HeroStage />
        </div>
        <div className="order-2 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>
    </main>
  );
}
