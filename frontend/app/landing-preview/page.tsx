import { HeroStage } from "@/components/landing/hero-stage";
import { LandingBgEffects } from "@/components/landing/landing-bg-effects";
import { SectionSources } from "@/components/landing/section-sources";
import { SectionExtension } from "@/components/landing/section-extension";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";
import { SectionMemory } from "@/components/landing/section-memory";
import { SectionPricing } from "@/components/landing/section-pricing";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPreviewPage() {
  return (
    <main className="relative min-h-screen">
      <LandingBgEffects />
      <div className="relative">
        <HeroStage />
        <SectionSources />
        <SectionExtension />
        <SectionPronunciation />
        <SectionMemory />
        <SectionPricing />
        <LandingFooter />
      </div>
    </main>
  );
}
