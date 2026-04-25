"use client";

import { Flame, TrendingUp, Layers } from "lucide-react";

import { useStats } from "@/lib/api/queries";

export function StatsCompact() {
  const { data, isLoading } = useStats();
  if (isLoading || !data) return null;

  const retentionPct =
    data.retention_30d !== null ? Math.round(data.retention_30d * 100) : null;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Flame className="h-3 w-3 text-amber-500" />
        <span className="font-semibold text-foreground">{data.streak_days}</span> días
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <TrendingUp className="h-3 w-3 text-emerald-500" />
        <span className="font-semibold text-foreground">
          {retentionPct !== null ? `${retentionPct}%` : "—"}
        </span>{" "}
        retención
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Layers className="h-3 w-3 text-blue-500" />
        <span className="font-semibold text-foreground">{data.totals.cards}</span> cards
      </span>
    </div>
  );
}

export function HeatmapStrip() {
  const { data } = useStats();
  if (!data) return null;
  const max = Math.max(1, ...data.heatmap_90d.map((d) => d.reviews + d.captures));

  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
      {data.heatmap_90d.map((d) => {
        const total = d.reviews + d.captures;
        const intensity = total === 0 ? 0 : 0.2 + (total / max) * 0.8;
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.reviews} reviews · ${d.captures} captures`}
            className="aspect-square rounded-sm"
            style={{
              backgroundColor:
                total === 0
                  ? "rgb(229, 231, 235)"
                  : `rgba(34, 197, 94, ${intensity})`,
            }}
          />
        );
      })}
    </div>
  );
}
