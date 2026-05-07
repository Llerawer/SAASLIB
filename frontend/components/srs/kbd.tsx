import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border bg-muted/40 text-[10px] font-mono text-muted-foreground tabular",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
