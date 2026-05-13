import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementType } from "react";

/**
 * Container — the only place where page max-widths + gutters live.
 *
 * Four "densities" matching the product's distinct reading registers.
 * Most surfaces should import the **named wrapper** (`ReadingContainer`,
 * `HeroContainer`, etc.) rather than `<Container size="...">`, because
 * the named component reads more clearly at the call site — and call-site
 * legibility matters a lot when you scan an unfamiliar page later.
 *
 *   - `reading` — narrow column for editorial long-form (article, EPUB
 *                 chrome). Mirrors a printed page; optimal line length
 *                 60-80 chars. Use via <ReadingContainer />.
 *
 *   - `default` — most app surfaces (library, settings, list views).
 *                 Comfortable reading + room for sidebars at lg+. Use via
 *                 <Container /> (default export when no specific register
 *                 is needed).
 *
 *   - `wide`    — galleries, media grids, dashboards. Cinematic ratio.
 *                 Use via <WideContainer />.
 *
 *   - `hero`    — landing-style cinematographic surfaces. No max-width
 *                 cap (only gutters), so the page can host edge-to-edge
 *                 imagery and dramatic typography while still respecting
 *                 mobile padding. Use via <HeroContainer />.
 *
 * Mobile gutters: 16px (px-4), tightening up to 24px (sm:px-6) and 32px
 * (lg:px-8). Never use `max-w-*` without paired responsive padding —
 * that's the bug class this component was created to eliminate.
 *
 * Usage:
 *   <ReadingContainer>{article}</ReadingContainer>
 *   <Container as="main" className="py-6">{children}</Container>
 *   <WideContainer>{grid}</WideContainer>
 *   <HeroContainer as="section">{hero}</HeroContainer>
 */
const SIZE_CLASSES = {
  reading: "max-w-[68ch]",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  // `hero` deliberately omits any max-width — landing-style surfaces flow
  // to the full viewport width. Gutters still apply.
  hero: "",
} as const;

export type ContainerSize = keyof typeof SIZE_CLASSES;

type ContainerOwnProps<T extends ElementType = "div"> = {
  size?: ContainerSize;
  as?: T;
};

export type ContainerProps<T extends ElementType = "div"> = ContainerOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof ContainerOwnProps<T>>;

/**
 * Generic Container. Prefer the named wrappers below unless you need a
 * dynamic size based on props.
 */
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

// ---------------------------------------------------------------------------
// Named wrappers — preferred over <Container size="..."> at the call site.
// ---------------------------------------------------------------------------

type NamedContainerProps<T extends ElementType = "div"> = Omit<
  ContainerProps<T>,
  "size"
>;

/** Narrow editorial column for long-form prose. ~68ch optimal line length. */
export function ReadingContainer<T extends ElementType = "div">(
  props: NamedContainerProps<T>,
) {
  return <Container size="reading" {...(props as ContainerProps<T>)} />;
}

/** Galleries, media grids, dashboards. */
export function WideContainer<T extends ElementType = "div">(
  props: NamedContainerProps<T>,
) {
  return <Container size="wide" {...(props as ContainerProps<T>)} />;
}

/** Landing / cinematographic — full viewport width, gutters only. */
export function HeroContainer<T extends ElementType = "div">(
  props: NamedContainerProps<T>,
) {
  return <Container size="hero" {...(props as ContainerProps<T>)} />;
}
