"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Library, BookMarked, GraduationCap, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCapturesList, useReviewQueue } from "@/lib/api/queries";

type NavItemKey = "library" | "vocabulary" | "srs" | "settings";

const NAV_ITEMS: {
  key: NavItemKey;
  href: string;
  label: string;
  icon: typeof Library;
}[] = [
  { key: "library", href: "/library", label: "Biblioteca", icon: Library },
  {
    key: "vocabulary",
    href: "/vocabulary",
    label: "Vocabulario",
    icon: BookMarked,
  },
  { key: "srs", href: "/srs", label: "Repaso", icon: GraduationCap },
  {
    key: "settings",
    href: "/settings",
    label: "Estadísticas",
    icon: BarChart3,
  },
];

function useNavCounts() {
  // Both queries are cached + shared with the page-level hooks. Stale-time
  // tolerates a few seconds of staleness after grading or capturing without
  // a full refetch — mutations on those flows already invalidate the keys.
  const pendingCaptures = useCapturesList({ promoted: false, limit: 200 });
  const reviewQueue = useReviewQueue();
  return {
    vocabulary:
      pendingCaptures.data && pendingCaptures.data.length > 0
        ? pendingCaptures.data.length
        : 0,
    srs:
      reviewQueue.data && reviewQueue.data.length > 0
        ? reviewQueue.data.length
        : 0,
    // `useReviewQueue` fetches with limit=20; treat 20 as "20+".
    srsCapped: (reviewQueue.data?.length ?? 0) >= 20,
  };
}

function NavBadge({
  count,
  capped,
  tone,
  align,
}: {
  count: number;
  capped?: boolean;
  tone: "accent" | "warning";
  align: "inline" | "trailing";
}) {
  if (count <= 0) return null;
  const toneClasses =
    tone === "accent"
      ? "bg-accent/15 text-accent border-accent/30"
      : "bg-warning/15 text-warning-foreground border-warning/40";
  const display = capped ? `${count}+` : String(count);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-bold tabular border rounded-full leading-none shrink-0",
        align === "trailing" && "ml-auto",
        toneClasses,
      )}
      aria-label={`${count}${capped ? " o más" : ""} pendientes`}
    >
      {display}
    </span>
  );
}

export function AppNavLinks({
  variant = "horizontal",
  onNavigate,
}: {
  variant?: "horizontal" | "vertical";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const counts = useNavCounts();
  return (
    <nav
      className={cn(
        variant === "horizontal"
          ? "flex items-center gap-1"
          : "flex flex-col gap-1",
      )}
      aria-label="Navegación principal"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badgeCount =
          item.key === "vocabulary"
            ? counts.vocabulary
            : item.key === "srs"
              ? counts.srs
              : 0;
        const badgeCapped = item.key === "srs" && counts.srsCapped;
        const badgeTone: "accent" | "warning" =
          item.key === "srs" ? "warning" : "accent";

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              variant === "vertical" && "w-full",
              active
                ? "bg-accent/15 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
            <NavBadge
              count={badgeCount}
              capped={badgeCapped}
              tone={badgeTone}
              align={variant === "vertical" ? "trailing" : "inline"}
            />
          </Link>
        );
      })}
    </nav>
  );
}
