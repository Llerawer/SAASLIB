"use client";

import React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: { width: "120px" },
  default: { width: "160px" },
  lg: { width: "220px" },
} as const;

type PerspectiveBookProps = {
  size?: keyof typeof sizeMap;
  className?: string;
  children: React.ReactNode;
};

/**
 * 3D book frame. On hover the book rotates around Y to reveal the spine
 * edge, simulating a book lifted off a shelf. Pure CSS transforms — no
 * JS state, no listeners, no animation library. The group selector lives
 * on the outer wrapper so the parent <Link> hover state triggers the tilt
 * as well as the book's own hover area.
 *
 * `children` is the front cover content (typically <img>).
 */
export function PerspectiveBook({
  size = "default",
  className,
  children,
}: PerspectiveBookProps) {
  return (
    <div className="z-10 group [perspective:900px] w-min h-min mx-auto">
      <div
        style={{
          width: sizeMap[size].width,
          borderRadius: "6px 4px 4px 6px",
        }}
        className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d] [transform:rotateY(0deg)] group-hover:[transform:rotateY(-20deg)] group-hover:scale-[1.04] group-hover:-translate-x-1 aspect-[2/3]"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 overflow-hidden size-full flex flex-col after:content-[''] after:absolute after:inset-0 after:shadow-[0_1.8px_3.6px_#0000000d,_0_10.8px_21.6px_#00000014,_inset_0_-.9px_#0000001a,_inset_0_1.8px_1.8px_#ffffff1a,_inset_3.6px_0_3.6px_#0000001a] after:pointer-events-none after:rounded-[inherit] after:border-[#00000014] after:border after:border-solid bg-neutral-100 dark:bg-[#1f1f1f]",
            className,
          )}
          style={{
            transform: "translateZ(25px)",
            borderRadius: "6px 4px 4px 6px",
          }}
        >
          {/* Spine highlight + gutter shadow (the dual-gradient on the left
              edge sells the "this is a book, not a postcard" illusion). */}
          <div
            className="absolute left-0 top-0 h-full opacity-40 pointer-events-none"
            style={{
              minWidth: "8.2%",
              background:
                "linear-gradient(90deg, hsla(0, 0%, 100%, 0), hsla(0, 0%, 100%, 0) 12%, hsla(0, 0%, 100%, .25) 29.25%, hsla(0, 0%, 100%, 0) 50.5%, hsla(0, 0%, 100%, 0) 75.25%, hsla(0, 0%, 100%, .25) 91%, hsla(0, 0%, 100%, 0)), linear-gradient(90deg, rgba(0, 0, 0, .03), rgba(0, 0, 0, .1) 12%, transparent 30%, rgba(0, 0, 0, .02) 50%, rgba(0, 0, 0, .2) 73.5%, rgba(0, 0, 0, .5) 75.25%, rgba(0, 0, 0, .15) 85.25%, transparent)",
            }}
          />
          <div className="pl-1 h-full w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
