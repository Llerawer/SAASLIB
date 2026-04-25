"use client";

import { useStats } from "@/lib/api/queries";
import { HeatmapStrip, StatsCompact } from "@/components/stats-compact";

export default function SettingsPage() {
  const { data, isLoading } = useStats();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">Estadísticas</h1>
        <StatsCompact />
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Sin datos aún.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Hoy due" value={data.cards_today_due} />
            <Stat label="Hoy hechas" value={data.cards_today_done} />
            <Stat
              label="Retención 30d"
              value={
                data.retention_30d !== null
                  ? `${Math.round(data.retention_30d * 100)}%`
                  : "—"
              }
            />
            <Stat label="Streak" value={`${data.streak_days} días`} />
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-2">Actividad 90 días</h2>
            <HeatmapStrip />
            <p className="text-xs text-muted-foreground mt-2">
              Cada cuadro es 1 día. Verde más intenso = más actividad
              (reviews + capturas).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-2">Totales</h2>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>{data.totals.captures} capturas en total</li>
              <li>{data.totals.cards} tarjetas creadas</li>
              <li>{data.totals.reviews} repasos hechos</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
