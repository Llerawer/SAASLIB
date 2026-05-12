import { HeroCopyColumn } from "@/components/landing/hero-copy-column";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24 grid gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div aria-hidden="true" className="order-1 md:order-1">
          {/* HeroStage placeholder — added in Task 8 */}
          <div className="aspect-[5/4] rounded-2xl border bg-card/50" />
        </div>
        <div className="order-2 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>
    </main>
  );
}
