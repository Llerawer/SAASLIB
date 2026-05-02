import { type LucideIcon } from "lucide-react";
import { Kbd } from "./kbd";

export type MenuRowSpec = {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  subtitle: string;
  shortcut: string;
  onClick: () => void;
};

export function MenuRow({
  row,
  index,
  destructive,
}: {
  row: MenuRowSpec;
  index: number;
  destructive?: boolean;
}) {
  const Icon = row.icon;
  return (
    <button
      type="button"
      onClick={row.onClick}
      style={{ animationDelay: `${index * 30}ms` }}
      className={`group flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards ${
        destructive ? "hover:bg-destructive/10" : "hover:bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center size-9 rounded-lg shrink-0 ${
          destructive ? "bg-destructive/10" : "bg-muted"
        }`}
      >
        <Icon className={`h-4 w-4 ${row.iconClassName ?? ""}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-medium ${destructive ? "text-destructive" : ""}`}
        >
          {row.label}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {row.subtitle}
        </span>
      </span>
      <Kbd className="shrink-0">{row.shortcut}</Kbd>
    </button>
  );
}
