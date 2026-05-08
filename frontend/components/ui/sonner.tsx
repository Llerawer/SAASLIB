"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * Project-themed sonner. Body text stays neutral (legibility) — the small
 * icon and a faint variant tint on bg/border carry the semantic signal.
 * Reads as native to the editorial language instead of stock sonner.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Subtle per-variant tint. 6% bg wash + 35% border = enough to
          // recognise at a glance without competing with the body text.
          "--success-bg":
            "color-mix(in oklch, var(--success) 6%, var(--popover))",
          "--success-border":
            "color-mix(in oklch, var(--success) 35%, var(--border))",
          "--success-text": "var(--popover-foreground)",
          "--error-bg":
            "color-mix(in oklch, var(--destructive) 6%, var(--popover))",
          "--error-border":
            "color-mix(in oklch, var(--destructive) 35%, var(--border))",
          "--error-text": "var(--popover-foreground)",
          "--warning-bg":
            "color-mix(in oklch, var(--warning) 6%, var(--popover))",
          "--warning-border":
            "color-mix(in oklch, var(--warning) 35%, var(--border))",
          "--warning-text": "var(--popover-foreground)",
          "--info-bg":
            "color-mix(in oklch, var(--info) 6%, var(--popover))",
          "--info-border":
            "color-mix(in oklch, var(--info) 35%, var(--border))",
          "--info-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
