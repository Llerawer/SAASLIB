/**
 * Human-friendly relative date in Spanish.
 *
 * Returns "hoy" / "ayer" / "hace N días" / "hace N sem" / "hace N meses" /
 * full localized date for anything older than 6 months.
 *
 * Pure function — accepts the timestamp + the current epoch (caller passes
 * it so the function stays referentially transparent and rules-of-hooks
 * compliant: no Date.now() inside render bodies).
 */
export function relativeDate(
  iso: string | null,
  nowMs: number,
): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = nowMs - t;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "ayer";
  if (diffDay < 7) return `hace ${diffDay} días`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `hace ${diffWeek} sem`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 6) return `hace ${diffMonth} meses`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
