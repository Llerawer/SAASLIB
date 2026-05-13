"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Standard SSR-hydration guard: render placeholder until client mounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Cambiar tema"
        disabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const next =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon =
    theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
  const label =
    theme === "dark"
      ? "Tema oscuro (cambiar a sistema)"
      : theme === "system"
        ? "Tema del sistema (cambiar a claro)"
        : "Tema claro (cambiar a oscuro)";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
