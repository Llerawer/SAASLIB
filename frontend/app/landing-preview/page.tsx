import { HeroStage } from "@/components/landing/hero-stage";
import { LandingBgEffects } from "@/components/landing/landing-bg-effects";
import { SectionSources } from "@/components/landing/section-sources";
import { SectionExtension } from "@/components/landing/section-extension";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";
import { SectionMemory } from "@/components/landing/section-memory";
import { SectionPricing } from "@/components/landing/section-pricing";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingSidenav } from "@/components/landing/landing-sidenav";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { SectionDivider } from "@/components/landing/section-divider";

export default function LandingPreviewPage() {
  return (
    <main className="relative min-h-screen">
      <LandingBgEffects />
      <ScrollProgress />
      <LandingSidenav />
      <div className="relative">
        <HeroStage />
        <SectionDivider />
        <SectionSources />
        <SectionDivider />
        <SectionExtension />
        <SectionDivider />
        <SectionPronunciation />
        <SectionDivider />
        <SectionMemory />
        <SectionDivider />
        <SectionPricing />
        <LandingFooter />
      </div>
    </main>
  );
}
