import { HeroStage } from "@/components/landing/hero-stage";
import { LandingBgEffects } from "@/components/landing/landing-bg-effects";
import { SectionCapture } from "@/components/landing/section-capture";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";
import { SectionMemory } from "@/components/landing/section-memory";
import { SectionLibrary } from "@/components/landing/section-library";
import { SectionHow } from "@/components/landing/section-how";
import { SectionPricing } from "@/components/landing/section-pricing";
import { SectionSocial } from "@/components/landing/section-social";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingSidenav } from "@/components/landing/landing-sidenav";
import { SectionDivider } from "@/components/landing/section-divider";
import { InstallPrompt } from "@/components/landing/install-prompt";

/**
 * Full landing composition. Used by both `/` (production home for
 * non-authenticated users) and `/landing-preview` (dev/QA preview).
 * Wraps in `.landing-stage` so the dark warm tokens scope correctly.
 */
export function LandingShell() {
  return (
    <div className="landing-stage min-h-screen relative overflow-hidden">
      <main className="relative min-h-screen">
        <LandingBgEffects />
        <LandingSidenav />
        <InstallPrompt />
        <div className="relative">
          <HeroStage />
          <SectionDivider />
          <SectionCapture />
          <SectionDivider />
          <SectionPronunciation />
          <SectionDivider />
          <SectionMemory />
          <SectionDivider />
          <SectionLibrary />
          <SectionDivider />
          <SectionHow />
          <SectionDivider />
          <SectionPricing />
          <SectionDivider />
          <SectionSocial />
          <LandingFooter />
        </div>
      </main>
    </div>
  );
}
