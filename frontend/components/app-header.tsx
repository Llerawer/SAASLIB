"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppNavLinks } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import LogoutButton from "@/components/logout-button";

export function AppHeader({ userEmail }: { userEmail: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b bg-background/85 backdrop-blur-sm sticky top-0 z-30">
      <div className="px-4 h-14 flex items-center gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Abrir menú"
              />
            }
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
                LinguaReader
              </SheetTitle>
            </SheetHeader>
            <AppNavLinks
              variant="vertical"
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="mt-auto pt-4 border-t space-y-3">
              <p className="text-xs text-muted-foreground truncate">
                {userEmail}
              </p>
              <div className="flex items-center justify-between gap-2">
                <ThemeToggle />
                <LogoutButton />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link
          href="/library"
          className="flex items-center gap-2 font-bold tracking-tight"
        >
          <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
          <span>LinguaReader</span>
        </Link>

        <div className="hidden md:block ml-4 flex-1">
          <AppNavLinks variant="horizontal" />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span className="hidden lg:inline text-xs text-muted-foreground mr-2 truncate max-w-[180px]">
            {userEmail}
          </span>
          <ThemeToggle />
          <div className="hidden md:block">
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
