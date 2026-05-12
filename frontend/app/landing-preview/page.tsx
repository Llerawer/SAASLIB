import { HeroStage } from "@/components/landing/hero-stage";
import { LandingBgEffects } from "@/components/landing/landing-bg-effects";
import { SectionCapture } from "@/components/landing/section-capture";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";
import { SectionMemory } from "@/components/landing/section-memory";
import { SectionHow } from "@/components/landing/section-how";
import { SectionPricing } from "@/components/landing/section-pricing";
import { SectionSocial } from "@/components/landing/section-social";
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
        <SectionCapture />
        <SectionDivider />
        <SectionPronunciation />
        <SectionDivider />
        <SectionMemory />
        <SectionDivider />
        <SectionHow />
        <SectionDivider />
        <SectionPricing />
        <SectionDivider />
        <SectionSocial />
        <LandingFooter />
      </div>
    </main>
  );
}
