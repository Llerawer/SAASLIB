"use client";

import { Settings2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { READER_THEMES } from "@/lib/reader/themes";
import {
  FONT_SIZE_STEPS,
  LINE_HEIGHT_STEPS,
  type FontFamilyId,
  type GestureAxis,
  type ReaderSettings,
  type SpreadMode,
} from "@/lib/reader/settings";

type Props = {
  settings: ReaderSettings;
  onChange: <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => void;
  onIncFontSize: () => void;
  onDecFontSize: () => void;
  onReset: () => void;
};

export function ReaderSettingsButton(props: Props) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Ajustes de lectura"
          />
        }
      >
        <Settings2 className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[380px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ajustes de lectura</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-6">
          <ColorSection {...props} />
          <TypographySection {...props} />
          <ViewSection {...props} />
          <GestureSection {...props} />
          <ResetSection {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ColorSection({ settings, onChange }: Props) {
  return (
    <Section title="Modo de color">
      <div className="grid grid-cols-2 gap-2">
        {READER_THEMES.map((t) => {
          const active = settings.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange("theme", t.id)}
              className={`text-left rounded-md border-2 p-2 transition-colors ${
                active
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              aria-pressed={active}
            >
              <div
                className="rounded h-12 mb-1 flex items-center justify-center text-xs font-medium"
                style={{
                  backgroundColor: t.background,
                  color: t.foreground,
                }}
              >
                Aa
              </div>
              <div className="text-xs">{t.label}</div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function TypographySection({
  settings,
  onChange,
  onIncFontSize,
  onDecFontSize,
}: Props) {
  const fonts: { id: FontFamilyId; label: string; sample: string }[] = [
    { id: "serif", label: "Serif", sample: "Aa" },
    { id: "sans", label: "Sans", sample: "Aa" },
    { id: "mono", label: "Mono", sample: "Aa" },
  ];
  return (
    <Section title="Tipografía">
      <div className="grid grid-cols-3 gap-2">
        {fonts.map((f) => {
          const active = settings.fontFamily === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange("fontFamily", f.id)}
              className={`rounded-md border-2 p-2 text-center transition-colors ${
                active
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              aria-pressed={active}
            >
              <div
                className="text-2xl"
                style={{
                  fontFamily:
                    f.id === "serif"
                      ? "Georgia, serif"
                      : f.id === "sans"
                        ? "system-ui, sans-serif"
                        : "monospace",
                }}
              >
                {f.sample}
              </div>
              <div className="text-xs mt-1">{f.label}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">Tamaño</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onDecFontSize}
            disabled={settings.fontSizePct <= FONT_SIZE_STEPS[0]}
            aria-label="Reducir tamaño"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-xs w-12 text-center tabular-nums">
            {settings.fontSizePct}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onIncFontSize}
            disabled={
              settings.fontSizePct >= FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]
            }
            aria-label="Aumentar tamaño"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <span className="text-xs text-muted-foreground">Interlineado</span>
        <div className="grid grid-cols-4 gap-2 mt-1">
          {LINE_HEIGHT_STEPS.map((lh) => {
            const active = settings.lineHeight === lh;
            return (
              <button
                key={lh}
                type="button"
                onClick={() => onChange("lineHeight", lh)}
                className={`rounded-md border text-xs py-1.5 transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-muted hover:border-muted-foreground/40"
                }`}
                aria-pressed={active}
              >
                {lh.toFixed(1)}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function ViewSection({ settings, onChange }: Props) {
  const modes: { id: SpreadMode; label: string }[] = [
    { id: "single", label: "Una página" },
    { id: "double", label: "Dos páginas" },
  ];
  return (
    <Section title="Vista">
      <div className="grid grid-cols-2 gap-2">
        {modes.map((m) => {
          const active = settings.spread === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange("spread", m.id)}
              className={`rounded-md border-2 p-3 transition-colors ${
                active
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              aria-pressed={active}
            >
              <div className="flex items-center justify-center gap-1 h-10">
                {m.id === "single" ? (
                  <div className="w-5 h-9 border-2 border-current rounded-sm" />
                ) : (
                  <>
                    <div className="w-4 h-9 border-2 border-current rounded-sm" />
                    <div className="w-4 h-9 border-2 border-current rounded-sm" />
                  </>
                )}
              </div>
              <div className="text-xs mt-1 text-center">{m.label}</div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function GestureSection({ settings, onChange }: Props) {
  const axes: { id: GestureAxis; label: string; hint: string }[] = [
    { id: "horizontal", label: "Horizontal", hint: "Desliza ← →" },
    { id: "vertical", label: "Vertical", hint: "Desliza ↑ ↓" },
  ];
  return (
    <Section title="Gestos">
      <div className="grid grid-cols-2 gap-2">
        {axes.map((a) => {
          const active = settings.gestureAxis === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange("gestureAxis", a.id)}
              className={`rounded-md border-2 p-2 text-left transition-colors ${
                active
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              aria-pressed={active}
            >
              <div className="text-sm font-medium">{a.label}</div>
              <div className="text-xs text-muted-foreground">{a.hint}</div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function ResetSection({ onReset }: Props) {
  return (
    <Section title="Restablecer">
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        className="w-full"
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        Valores por defecto
      </Button>
    </Section>
  );
}

