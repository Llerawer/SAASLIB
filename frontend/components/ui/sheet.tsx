"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/30 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

type SheetSide = "left" | "right" | "top" | "bottom";

const sideClasses: Record<SheetSide, string> = {
  left: "left-0 top-0 h-full w-[85vw] max-w-sm border-r data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left",
  right:
    "right-0 top-0 h-full w-[85vw] max-w-sm border-l data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
  top: "top-0 left-0 w-full h-auto max-h-[90vh] border-b data-open:animate-in data-open:slide-in-from-top data-closed:animate-out data-closed:slide-out-to-top",
  bottom:
    "bottom-0 left-0 w-full h-auto max-h-[90vh] border-t data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
};

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: SheetSide;
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover text-popover-foreground p-5 shadow-lg outline-none",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3"
                aria-label="Cerrar"
              />
            }
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold leading-tight", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
};
