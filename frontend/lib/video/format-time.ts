export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Human-friendly relative time in Spanish, e.g. "hace 3 días". */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "hace un momento"; // clock skew
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} ${day === 1 ? "día" : "días"}`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `hace ${wk} ${wk === 1 ? "semana" : "semanas"}`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `hace ${mo} ${mo === 1 ? "mes" : "meses"}`;
  const yr = Math.floor(day / 365);
  return `hace ${yr} ${yr === 1 ? "año" : "años"}`;
}
