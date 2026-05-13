"use client";

import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from "lucide-react";

import { useStats } from "@/lib/api/queries";

type HeatmapDay = { date: string; reviews: number; captures: number };

function computeLongestStreak(days: HeatmapDay[]): number {
  let max = 0;
  let cur = 0;
  for (const d of days) {
    if (d.reviews + d.captures > 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function computeWeekTrend(days: HeatmapDay[]): {
  current: number;
  previous: number;
  pctChange: number | null;
} {
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const sumActivity = (arr: HeatmapDay[]) =>
    arr.reduce((s, d) => s + d.reviews + d.captures, 0);
  const current = sumActivity(last7);
  const previous = sumActivity(prev7);
  if (previous === 0) {
    return { current, previous, pctChange: current > 0 ? null : 0 };
  }
  return {
    current,
    previous,
    pctChange: Math.round(((current - previous) / previous) * 100),
  };
}

export default function SettingsPage() {
  const { data, isLoading } = useStats();

  const isFreshUser =
    !!data &&
    data.totals.captures === 0 &&
    data.totals.cards === 0 &&
    data.totals.reviews === 0;

  const activeDays =
    data?.heatmap_90d.filter((d) => d.reviews + d.captures > 0).length ?? 0;
  const totalEvents =
    data?.heatmap_90d.reduce((s, d) => s + d.reviews + d.captures, 0) ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* Editorial masthead — same motif as /watch and /videos: serif h1
          + thin amber rule + meta line. Ties the page to the rest of the
          app's identity. */}
      <header className="mb-10">
        <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight">
          Estadísticas
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground tabular">
          Últimos 90 días
          {data && (
            <>
              {" · "}
              {activeDays} {activeDays === 1 ? "día activo" : "días activos"}
              {" · "}
              {totalEvents.toLocaleString()}{" "}
              {totalEvents === 1 ? "evento" : "eventos"}
            </>
          )}
        </p>
      </header>

      {isLoading ? (
        <StatsSkeleton />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Sin datos aún.</p>
      ) : isFreshUser ? (
        <FreshUserNudge />
      ) : (
        <div className="space-y-12">
          <SectionHoy
            streak={data.streak_days}
            todayDone={data.cards_today_done}
            todayDue={data.cards_today_due}
            retention30d={data.retention_30d}
          />
          <SectionTendencia
            heatmap={data.heatmap_90d}
            currentStreak={data.streak_days}
          />
          <SectionTotal
            heatmap={data.heatmap_90d}
            totals={data.totals}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SECTION KICKER — recurring motif: amber dot + small caps label + rule.    */
/* -------------------------------------------------------------------------- */
function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="size-1 rounded-full bg-accent" aria-hidden />
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SECTION 1 — HOY: typographic streak + inline metrics row, no cards.       */
/* -------------------------------------------------------------------------- */
function SectionHoy({
  streak,
  todayDone,
  todayDue,
  retention30d,
}: {
  streak: number;
  todayDone: number;
  todayDue: number;
  retention30d: number | null;
}) {
  const remaining = Math.max(0, todayDue - todayDone);

  // Editorial copy — narrative voice instead of stat-grid labels.
  const streakLine = (() => {
    if (streak === 0 && todayDue === 0) return "Aún no has empezado tu racha.";
    if (streak === 0) return "Empieza tu racha con un repaso hoy.";
    if (todayDue === 0) return "Sin pendientes hoy. Mantén el ritmo mañana.";
    if (remaining === 0) return "Día completo. Vuelve mañana.";
    return `Te faltan ${remaining} ${remaining === 1 ? "tarjeta" : "tarjetas"} para mantener la racha.`;
  })();

  return (
    <section>
      <SectionKicker>Hoy</SectionKicker>

      {/* Typographic streak: number is the headline, unit reads as a magazine
          pull-quote. No flame, no circle, no Duolingo gloss. */}
      <div className="mb-8">
        <h2 className="font-serif font-semibold leading-none tracking-tight">
          {streak > 0 ? (
            <>
              <span className="text-5xl md:text-6xl tabular">{streak}</span>{" "}
              <span className="text-3xl md:text-4xl font-normal italic text-muted-foreground/70">
                {streak === 1 ? "día" : "días"} de racha
              </span>
            </>
          ) : (
            <span className="text-3xl md:text-4xl font-normal italic text-muted-foreground/70">
              Sin racha activa
            </span>
          )}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground max-w-md">
          {streakLine}
        </p>
      </div>

      {/* Inline metrics: vertical rules between, no cards. Editorial table. */}
      <dl className="flex items-stretch border-y border-border divide-x divide-border">
        <Metric label="Pendientes hoy" value={todayDue} />
        <Metric label="Hechas hoy" value={todayDone} accented={todayDone > 0} />
        <Metric
          label="Retención 30 días"
          value={
            retention30d !== null ? `${Math.round(retention30d * 100)}%` : "·"
          }
        />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  accented = false,
}: {
  label: string;
  value: string | number;
  accented?: boolean;
}) {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 first:pl-0 last:pr-0">
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1.5 font-serif text-2xl font-semibold tabular leading-tight ${
          accented ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SECTION 2 — TENDENCIA: longest streak + week-over-week, typographic.      */
/* -------------------------------------------------------------------------- */
function SectionTendencia({
  heatmap,
  currentStreak,
}: {
  heatmap: HeatmapDay[];
  currentStreak: number;
}) {
  const longestStreak = computeLongestStreak(heatmap);
  const trend = computeWeekTrend(heatmap);

  const isCurrentBest = currentStreak > 0 && currentStreak >= longestStreak;
  const streakSubtitle = (() => {
    if (longestStreak === 0) return "Empieza tu primera racha hoy.";
    if (isCurrentBest) return "Estás en tu mejor racha.";
    if (currentStreak === 0) return "Listo para volver.";
    const delta = longestStreak - currentStreak;
    return `${delta} ${delta === 1 ? "día" : "días"} para igualarla.`;
  })();

  const TrendIcon =
    trend.pctChange === null || trend.pctChange === 0
      ? Minus
      : trend.pctChange > 0
        ? TrendingUp
        : TrendingDown;
  const trendValue =
    trend.pctChange === null
      ? trend.current > 0
        ? `+${trend.current}`
        : "·"
      : trend.pctChange === 0
        ? "Igual"
        : `${trend.pctChange > 0 ? "+" : ""}${trend.pctChange}%`;
  const trendIsPositive = trend.pctChange !== null && trend.pctChange > 0;
  const trendSubtitle = (() => {
    if (trend.previous === 0 && trend.current === 0) {
      return "Sin actividad las últimas dos semanas.";
    }
    if (trend.previous === 0) {
      return `Empezaste con ${trend.current} ${trend.current === 1 ? "evento" : "eventos"}.`;
    }
    if (trend.pctChange === 0) {
      return "Misma actividad que la semana pasada.";
    }
    return `${trend.current} esta semana, ${trend.previous} la pasada.`;
  })();

  return (
    <section>
      <SectionKicker>Tendencia</SectionKicker>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Racha más larga
          </p>
          <p className="font-serif text-2xl font-semibold mt-2 leading-tight">
            <span className="tabular">{longestStreak}</span>{" "}
            <span className="italic font-normal text-base text-muted-foreground/70">
              {longestStreak === 1 ? "día" : "días"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground mt-1.5">
            {streakSubtitle}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Esta semana
          </p>
          <p
            className={`font-serif text-2xl font-semibold mt-2 leading-tight inline-flex items-center gap-2 tabular ${
              trendIsPositive ? "text-accent" : ""
            }`}
          >
            {trendValue}
            <TrendIcon className="h-4 w-4" aria-hidden />
          </p>
          <p className="text-sm text-muted-foreground mt-1.5">
            {trendSubtitle}
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  SECTION 3 — TOTAL: 90-day calendar heatmap + lifetime totals.             */
/* -------------------------------------------------------------------------- */
function SectionTotal({
  heatmap,
  totals,
}: {
  heatmap: HeatmapDay[];
  totals: { captures: number; cards: number; reviews: number };
}) {
  return (
    <section>
      <SectionKicker>Total</SectionKicker>
      <ActivityHeatmap days={heatmap} />
      <dl className="mt-8 flex items-stretch border-y border-border divide-x divide-border">
        <TotalCell label="Capturas" value={totals.captures} />
        <TotalCell label="Tarjetas" value={totals.cards} />
        <TotalCell label="Repasos" value={totals.reviews} />
      </dl>
    </section>
  );
}

function TotalCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 first:pl-0 last:pr-0">
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 font-serif text-2xl font-semibold tabular leading-tight">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ACTIVITY HEATMAP — recoloured to use --accent (terracota) instead of      */
/*  --success: the heatmap shows presence, not success/failure. Using accent  */
/*  ties it to the brand identity.                                            */
/* -------------------------------------------------------------------------- */
function ActivityHeatmap({ days }: { days: HeatmapDay[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.reviews + d.captures));

  const weeks: ((typeof days)[number] | null)[][] = [];
  let currentWeek: ((typeof days)[number] | null)[] = [];
  const firstDay = new Date(days[0].date);
  const firstDow = (firstDay.getDay() + 6) % 7; // Monday=0..Sunday=6
  for (let i = 0; i < firstDow; i++) currentWeek.push(null);
  for (const d of days) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2">
        <div
          className="grid gap-px text-xs text-muted-foreground tabular pt-px"
          style={{
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            minWidth: "0.75rem",
          }}
          aria-hidden
        >
          {weekdayLabels.map((d, i) => (
            <span
              key={i}
              className="aspect-square flex items-center justify-end pr-1"
              style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
            >
              {d}
            </span>
          ))}
        </div>
        <div
          className="grid gap-px flex-1"
          style={{
            gridAutoFlow: "column",
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            gridAutoColumns: "minmax(0, 1fr)",
          }}
        >
          {weeks.flat().map((d, i) =>
            d === null ? (
              <div key={`pad-${i}`} className="aspect-square" />
            ) : (
              <div
                key={d.date}
                title={`${d.date}: ${d.reviews} repasos · ${d.captures} capturas`}
                className="aspect-square rounded-sm"
                style={
                  d.reviews + d.captures === 0
                    ? { backgroundColor: "var(--muted)" }
                    : {
                        backgroundColor: "var(--accent)",
                        opacity:
                          0.18 + ((d.reviews + d.captures) / max) * 0.82,
                      }
                }
              />
            ),
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-3 text-xs text-muted-foreground">
        <span>Tranquilo</span>
        <div className="flex gap-px">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <div
              key={step}
              className="size-3 rounded-sm"
              style={{
                backgroundColor:
                  step === 0 ? "var(--muted)" : "var(--accent)",
                opacity: step === 0 ? 1 : 0.18 + step * 0.82,
              }}
            />
          ))}
        </div>
        <span>Intenso</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EMPTY STATE — fresh user, zero captures/cards/reviews.                    */
/* -------------------------------------------------------------------------- */
function FreshUserNudge() {
  return (
    <section className="max-w-xl">
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="size-1 rounded-full bg-accent" aria-hidden />
        Empezar
      </p>
      <h2 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mt-3 leading-tight">
        Tus estadísticas viven aquí.
      </h2>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
        Captura una palabra leyendo un libro o pega un video de YouTube
        para que tu progreso aparezca en este panel.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <NudgeChip href="/library">Mi biblioteca</NudgeChip>
        <NudgeChip href="/videos">Pegar un video</NudgeChip>
        <NudgeChip href="/srs">Empezar repaso</NudgeChip>
      </div>
    </section>
  );
}

function NudgeChip({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs rounded-full border border-border bg-card hover:bg-muted/70 hover:border-accent/50 transition-colors duration-150 ease-out"
    >
      <span>{children}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  SKELETON                                                                  */
/* -------------------------------------------------------------------------- */
function StatsSkeleton() {
  return (
    <div className="space-y-12 animate-pulse" aria-busy="true">
      <div>
        <div className="h-12 w-72 bg-muted rounded mb-4" />
        <div className="h-px bg-border mb-6" />
        <div className="h-16 bg-muted rounded" />
      </div>
      <div>
        <div className="h-3 w-24 bg-muted rounded mb-6" />
        <div className="grid grid-cols-2 gap-12">
          <div className="h-16 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
      <div>
        <div className="h-3 w-24 bg-muted rounded mb-6" />
        <div className="h-40 bg-muted rounded" />
      </div>
    </div>
  );
}
