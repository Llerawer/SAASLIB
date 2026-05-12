import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementType } from "react";

/**
 * Container — the only place where page max-widths + gutters live.
 *
 * Three "densities" matching the product's distinct reading registers:
 *
 *   - `reading` — narrow column for editorial long-form (article, EPUB chrome).
 *                 Mirrors a printed page; optimal line length 60-80 chars.
 *   - `default` — most surfaces (library, settings, list views). Comfortable
 *                 reading + room for sidebars at lg+ breakpoints.
 *   - `wide`    — landing, hero, dashboard. Cinematic / wide-ratio.
 *
 * Mobile gutters are 16px (px-4) tightening from sm: 24px and lg: 32px.
 * Never `max-w-*` without paired padding — that's the bug we're preventing.
 *
 * Usage:
 *   <Container size="reading">{children}</Container>
 *   <Container as="main" size="default" className="py-6">{children}</Container>
 */
const SIZE_CLASSES = {
  reading: "max-w-[68ch]",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export type ContainerSize = keyof typeof SIZE_CLASSES;

type ContainerOwnProps<T extends ElementType = "div"> = {
  size?: ContainerSize;
  as?: T;
};

export type ContainerProps<T extends ElementType = "div"> = ContainerOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof ContainerOwnProps<T>>;

export function Container<T extends ElementType = "div">({
  size = "default",
  as,
  className,
  children,
  ...rest
}: ContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={cn(
        SIZE_CLASSES[size],
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
