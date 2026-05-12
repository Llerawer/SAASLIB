import { HeroStage } from "@/components/landing/hero-stage";
import { LandingBgEffects } from "@/components/landing/landing-bg-effects";

export default function LandingPreviewPage() {
  return (
    <main className="relative min-h-screen flex items-center">
      <LandingBgEffects />
      <div className="relative w-full">
        <HeroStage />
      </div>
    </main>
  );
}
