"use client";

type Props = {
  accent: string;
  channel: string;
  onAccentChange: (v: string) => void;
  onChannelChange: (v: string) => void;
};

const ACCENT_OPTIONS = [
  { value: "all", label: "Todos los acentos" },
  { value: "US", label: "Americano" },
  { value: "UK", label: "Británico" },
  { value: "AU", label: "Australiano" },
  { value: "NEUTRAL", label: "Neutro" },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos los canales" },
  { value: "TED", label: "TED" },
  { value: "TED-Ed", label: "TED-Ed" },
  { value: "BBC Learning English", label: "BBC Learning English" },
  { value: "VOA Learning English", label: "VOA Learning English" },
];

const SELECT_CLASS =
  "border border-input bg-background rounded-md px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring outline-none";

export function PronounceFiltersBar({
  accent,
  channel,
  onAccentChange,
  onChannelChange,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="pronounce-accent">
        Acento
      </label>
      <select
        id="pronounce-accent"
        value={accent}
        onChange={(e) => onAccentChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {ACCENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="pronounce-channel">
        Canal
      </label>
      <select
        id="pronounce-channel"
        value={channel}
        onChange={(e) => onChannelChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {CHANNEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
