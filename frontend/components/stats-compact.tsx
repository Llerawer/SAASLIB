"use client";

import { Flame, TrendingUp, Layers } from "lucide-react";

import { useStats } from "@/lib/api/queries";

export function StatsCompact() {
  const { data, isLoading } = useStats();
  if (isLoading || !data) return null;

  const retentionPct =
    data.retention_30d !== null ? Math.round(data.retention_30d * 100) : null;

  return (
    <div className="flex items-center gap-3 text-xs tabular">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
        <span className="font-semibold text-foreground">{data.streak_days}</span>
        <span>días</span>
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        <span className="font-semibold text-foreground">
          {retentionPct !== null ? `${retentionPct}%` : "·"}
        </span>
        <span>retención</span>
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Layers className="h-3.5 w-3.5 text-info" aria-hidden="true" />
        <span className="font-semibold text-foreground">{data.totals.cards}</span>
        <span>tarjetas</span>
      </span>
    </div>
  );
}

export function HeatmapStrip() {
  const { data } = useStats();
  if (!data) return null;
  const max = Math.max(1, ...data.heatmap_90d.map((d) => d.reviews + d.captures));

  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      role="img"
      aria-label="Mapa de actividad de los últimos 90 días"
    >
      {data.heatmap_90d.map((d) => {
        const total = d.reviews + d.captures;
        const intensity = total === 0 ? 0 : 0.18 + (total / max) * 0.82;
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.reviews} repasos · ${d.captures} capturas`}
            className="aspect-square rounded-sm"
            style={
              total === 0
                ? { backgroundColor: "var(--muted)" }
                : {
                    backgroundColor: "var(--success)",
                    opacity: intensity,
                  }
            }
          />
        );
      })}
    </div>
  );
}
