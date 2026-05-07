"use client";

import {
  Type,
  Minus,
  Plus,
  AlignJustify,
  BookOpen,
  Book,
  ArrowLeftRight,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  FONT_FAMILY_STACKS,
  FONT_SIZE_STEPS,
  LINE_HEIGHT_STEPS,
  type FontFamilyId,
  type GestureAxis,
  type ReaderSettings,
  type SpreadMode,
} from "@/lib/reader/settings";
import { READER_THEMES, type ReaderTheme } from "@/lib/reader/themes";

type Props = {
  trigger: React.ReactNode;
  settings: ReaderSettings;
  onUpdate: <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => void;
  onIncFontSize: () => void;
  onDecFontSize: () => void;
  onReset: () => void;
};

const FONT_FAMILY_OPTIONS: { id: FontFamilyId; label: string }[] = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
  { id: "mono", label: "Mono" },
];

const SPREAD_OPTIONS: { id: SpreadMode; label: string; icon: React.ReactNode }[] = [
  { id: "single", label: "Una hoja", icon: <Book className="h-4 w-4" /> },
  { id: "double", label: "Dos hojas", icon: <BookOpen className="h-4 w-4" /> },
];

const GESTURE_OPTIONS: { id: GestureAxis; label: string; icon: React.ReactNode }[] = [
  {
    id: "horizontal",
    label: "Horizontal",
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
  {
    id: "vertical",
    label: "Vertical",
    icon: <ArrowUpDown className="h-4 w-4" />,
  },
];

export function ReaderSettingsSheet({
  trigger,
  settings,
  onUpdate,
  onIncFontSize,
  onDecFontSize,
  onReset,
}: Props) {
  const minSize = FONT_SIZE_STEPS[0];
  const maxSize = FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
  const atMin = settings.fontSizePct <= minSize;
  const atMax = settings.fontSizePct >= maxSize;

  return (
    <Sheet>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ajustes de lectura</SheetTitle>
        </SheetHeader>

        <Section label="Color">
          <div className="grid grid-cols-2 gap-2">
            {READER_THEMES.map((t) => (
              <ThemeSwatch
                key={t.id}
                theme={t}
                active={settings.theme === t.id}
                onClick={() => onUpdate("theme", t.id)}
              />
            ))}
          </div>
        </Section>

        <Section label="Fuente" icon={<Type className="h-4 w-4" />}>
          <div className="grid grid-cols-3 gap-2">
            {FONT_FAMILY_OPTIONS.map((f) => (
              <Pill
                key={f.id}
                active={settings.fontFamily === f.id}
                onClick={() => onUpdate("fontFamily", f.id)}
              >
                <span style={{ fontFamily: FONT_FAMILY_STACKS[f.id] }}>
                  {f.label}
                </span>
              </Pill>
            ))}
          </div>
        </Section>

        <Section label="Tamaño">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDecFontSize}
              disabled={atMin}
              aria-label="Reducir tamaño"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center text-sm tabular-nums">
              {settings.fontSizePct}%
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onIncFontSize}
              disabled={atMax}
              aria-label="Aumentar tamaño"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Section>

        <Section label="Interlineado" icon={<AlignJustify className="h-4 w-4" />}>
          <div className="grid grid-cols-4 gap-2">
            {LINE_HEIGHT_STEPS.map((lh) => (
              <Pill
                key={lh}
                active={Math.abs(settings.lineHeight - lh) < 0.01}
                onClick={() => onUpdate("lineHeight", lh)}
              >
                {lh.toFixed(1)}
              </Pill>
            ))}
          </div>
        </Section>

        <Section label="Página">
          <div className="grid grid-cols-2 gap-2">
            {SPREAD_OPTIONS.map((s) => (
              <Pill
                key={s.id}
                active={settings.spread === s.id}
                onClick={() => onUpdate("spread", s.id)}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {s.icon}
                  {s.label}
                </span>
              </Pill>
            ))}
          </div>
        </Section>

        {settings.spread === "single" && (
          <Section label="Dirección del gesto">
            <div className="grid grid-cols-2 gap-2">
              {GESTURE_OPTIONS.map((g) => (
                <Pill
                  key={g.id}
                  active={settings.gestureAxis === g.id}
                  onClick={() => onUpdate("gestureAxis", g.id)}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {g.icon}
                    {g.label}
                  </span>
                </Pill>
              ))}
            </div>
          </Section>
        )}

        <div className="mt-auto pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="w-full"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Restablecer valores
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-accent border-border",
      )}
    >
      {children}
    </button>
  );
}

function ThemeSwatch({
  theme,
  active,
  onClick,
}: {
  theme: ReaderTheme;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-2 rounded-md p-3 text-left transition-all",
        active
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/50",
      )}
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
      }}
    >
      <div className="text-sm font-medium">{theme.label}</div>
      <div
        className="text-xs mt-0.5 opacity-80"
        style={{ fontFamily: "Georgia, serif" }}
      >
        Aa Bb Cc
      </div>
    </button>
  );
}
