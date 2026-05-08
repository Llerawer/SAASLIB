import { cn } from "@/lib/utils";

/**
 * Shared skeleton primitive. Use for loading-state placeholders that should
 * mimic the shape of the final content. Animation timing (`animate-pulse`)
 * and base color (`bg-muted`) are uniform across the app — pass `className`
 * for sizing / radius.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
