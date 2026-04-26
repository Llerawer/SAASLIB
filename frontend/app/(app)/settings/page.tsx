"use client";

import {
  Flame,
  BookOpen,
  Target,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Estadísticas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tu progreso de lectura y repaso a lo largo del tiempo.
        </p>
      </header>

      {isLoading ? (
        <StatsSkeleton />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Sin datos aún.</p>
      ) : (
        <>
          <RachaHero
            streak={data.streak_days}
            todayDone={data.cards_today_done}
            todayDue={data.cards_today_due}
          />

          <section
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            aria-label="Resumen del día"
          >
            <StatCard
              label="Pendientes hoy"
              value={data.cards_today_due}
              icon={Target}
              tone="info"
            />
            <StatCard
              label="Hechas hoy"
              value={data.cards_today_done}
              icon={GraduationCap}
              tone="success"
            />
            <StatCard
              label="Retención 30 días"
              value={
                data.retention_30d !== null
                  ? `${Math.round(data.retention_30d * 100)}%`
                  : "·"
              }
              icon={BookOpen}
              tone="default"
            />
          </section>

          <InsightsRow
            heatmap={data.heatmap_90d}
            currentStreak={data.streak_days}
          />

          <ActivityHeatmap days={data.heatmap_90d} />

          <section>
            <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
              Totales
            </h2>
            <dl className="border rounded-lg bg-card divide-y">
              <TotalsRow label="Capturas" value={data.totals.captures} />
              <TotalsRow label="Tarjetas creadas" value={data.totals.cards} />
              <TotalsRow label="Repasos hechos" value={data.totals.reviews} />
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function RachaHero({
  streak,
  todayDone,
  todayDue,
}: {
  streak: number;
  todayDone: number;
  todayDue: number;
}) {
  const remaining = Math.max(0, todayDue - todayDone);
  const completedToday = todayDone > 0 && remaining === 0;

  return (
    <section
      className="relative border rounded-xl bg-card overflow-hidden"
      aria-label="Racha actual"
    >
      <div
        className="absolute inset-0 opacity-60 dark:opacity-25 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 22% 25%, oklch(0.95 0.05 75 / 0.7) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="relative p-6 sm:p-8 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-8 items-center">
        <div className="flex items-center gap-4">
          <div className="relative inline-flex items-center justify-center size-16 sm:size-20 rounded-full bg-warning/15 text-warning ring-1 ring-warning/30">
            <Flame
              className="h-7 w-7 sm:h-9 sm:w-9"
              aria-hidden="true"
              fill="currentColor"
              fillOpacity={0.15}
            />
            {streak > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center size-5 rounded-full bg-warning text-warning-foreground text-[10px] font-bold ring-2 ring-card"
                aria-hidden="true"
              >
                ★
              </span>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Racha
            </p>
            <p className="text-4xl sm:text-5xl font-bold tabular tracking-tight font-serif leading-none mt-1">
              {streak}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {streak === 1 ? "día" : "días"} consecutivos
            </p>
          </div>
        </div>
        <div className="md:border-l md:pl-8 md:ml-2">
          {completedToday ? (
            <>
              <p className="text-sm font-medium text-success">
                Hoy ya está hecho.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {todayDone} {todayDone === 1 ? "tarjeta" : "tarjetas"} repasadas.
                Vuelve mañana para mantener la racha.
              </p>
            </>
          ) : remaining > 0 ? (
            <>
              <p className="text-sm font-medium">
                Te faltan {remaining}{" "}
                {remaining === 1 ? "tarjeta" : "tarjetas"} para terminar el día.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Mantén la racha viva. Hoy llevas {todayDone} de {todayDue}.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Sin repasos pendientes.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cuando promuevas más palabras, aparecerán aquí.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Flame;
  tone: "info" | "success" | "default";
}) {
  const toneClasses =
    tone === "info"
      ? "text-info bg-info/10 ring-info/25"
      : tone === "success"
        ? "text-success bg-success/10 ring-success/25"
        : "text-muted-foreground bg-muted ring-border";
  return (
    <div className="border rounded-lg p-4 bg-card flex items-start gap-3">
      <div
        className={`shrink-0 inline-flex items-center justify-center size-9 rounded-md ring-1 ${toneClasses}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-2xl font-bold mt-0.5 tabular leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function ActivityHeatmap({
  days,
}: {
  days: { date: string; reviews: number; captures: number }[];
}) {
  if (days.length === 0) {
    return null;
  }
  const max = Math.max(1, ...days.map((d) => d.reviews + d.captures));
  // Group days into weeks (columns) starting from Monday so the visual
  // matches a typical European calendar week.
  const weeks: ((typeof days)[number] | null)[][] = [];
  let currentWeek: ((typeof days)[number] | null)[] = [];
  // Pad the start of the first week so days line up with weekday rows.
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

  const totalActivity = days.reduce(
    (s, d) => s + d.reviews + d.captures,
    0,
  );
  const activeDays = days.filter((d) => d.reviews + d.captures > 0).length;

  const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <section aria-label="Actividad de los últimos 90 días">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Actividad — 90 días
        </h2>
        <p className="text-xs text-muted-foreground tabular">
          {activeDays} {activeDays === 1 ? "día activo" : "días activos"} ·{" "}
          {totalActivity.toLocaleString()} eventos
        </p>
      </div>
      <div className="border rounded-lg p-4 bg-card overflow-x-auto">
        <div className="flex gap-2">
          <div
            className="grid gap-px text-[10px] text-muted-foreground tabular pt-px"
            style={{
              gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              minWidth: "0.75rem",
            }}
            aria-hidden="true"
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
                          backgroundColor: "var(--success)",
                          opacity:
                            0.18 +
                            ((d.reviews + d.captures) / max) * 0.82,
                        }
                  }
                />
              ),
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-3 text-xs text-muted-foreground">
          <span>Menos</span>
          <div className="flex gap-px">
            {[0, 0.25, 0.5, 0.75, 1].map((step) => (
              <div
                key={step}
                className="size-3 rounded-sm"
                style={{
                  backgroundColor:
                    step === 0 ? "var(--muted)" : "var(--success)",
                  opacity: step === 0 ? 1 : 0.18 + step * 0.82,
                }}
              />
            ))}
          </div>
          <span>Más</span>
        </div>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true">
      <div className="border rounded-xl bg-card h-32" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-card border rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 bg-card border rounded-lg" />
        ))}
      </div>
      <div className="h-40 bg-card border rounded-lg" />
    </div>
  );
}

function InsightsRow({
  heatmap,
  currentStreak,
}: {
  heatmap: HeatmapDay[];
  currentStreak: number;
}) {
  const longestStreak = computeLongestStreak(heatmap);
  const trend = computeWeekTrend(heatmap);

  // Streak insight: how does today's streak compare to your best?
  const isCurrentBest = currentStreak > 0 && currentStreak >= longestStreak;
  const streakSubtitle = (() => {
    if (longestStreak === 0) return "Empieza tu primera racha hoy.";
    if (isCurrentBest) return "¡Estás en tu mejor racha!";
    if (currentStreak === 0) {
      return `Tu mejor: ${longestStreak} ${longestStreak === 1 ? "día" : "días"}.`;
    }
    const delta = longestStreak - currentStreak;
    return `${delta} ${delta === 1 ? "día" : "días"} para igualar tu mejor.`;
  })();

  // Trend insight: directional, conversational
  const trendIcon =
    trend.pctChange === null || trend.pctChange === 0
      ? Minus
      : trend.pctChange > 0
        ? TrendingUp
        : TrendingDown;
  const trendTone =
    trend.pctChange === null || trend.pctChange === 0
      ? "default"
      : trend.pctChange > 0
        ? "success"
        : "warning";
  const trendValue =
    trend.pctChange === null
      ? trend.current > 0
        ? `+${trend.current}`
        : "·"
      : trend.pctChange === 0
        ? "Igual"
        : `${trend.pctChange > 0 ? "+" : ""}${trend.pctChange}%`;
  const trendSubtitle = (() => {
    if (trend.previous === 0 && trend.current === 0) {
      return "Sin actividad las últimas 2 semanas.";
    }
    if (trend.previous === 0) {
      return `Empezaste esta semana con ${trend.current} ${
        trend.current === 1 ? "evento" : "eventos"
      }.`;
    }
    if (trend.pctChange === 0) {
      return `Misma actividad que la semana pasada.`;
    }
    const dir = (trend.pctChange ?? 0) > 0 ? "más" : "menos";
    return `${trend.current} esta semana · ${trend.previous} la pasada (${dir}).`;
  })();

  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      aria-label="Insights"
    >
      <InsightCard
        label="Racha más larga"
        value={`${longestStreak} ${longestStreak === 1 ? "día" : "días"}`}
        subtitle={streakSubtitle}
        icon={Trophy}
        tone={isCurrentBest ? "success" : "warning"}
      />
      <InsightCard
        label="Esta semana"
        value={trendValue}
        subtitle={trendSubtitle}
        icon={trendIcon}
        tone={trendTone}
      />
    </section>
  );
}

function InsightCard({
  label,
  value,
  subtitle,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: typeof Flame;
  tone: "info" | "success" | "warning" | "default";
}) {
  const toneClasses =
    tone === "info"
      ? "text-info bg-info/10 ring-info/25"
      : tone === "success"
        ? "text-success bg-success/10 ring-success/25"
        : tone === "warning"
          ? "text-warning bg-warning/10 ring-warning/25"
          : "text-muted-foreground bg-muted ring-border";
  return (
    <div className="border rounded-lg p-4 bg-card flex items-start gap-3">
      <div
        className={`shrink-0 inline-flex items-center justify-center size-9 rounded-md ring-1 ${toneClasses}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-xl font-bold mt-0.5 tabular leading-tight">
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
