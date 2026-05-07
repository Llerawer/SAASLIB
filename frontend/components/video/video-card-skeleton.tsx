/**
 * Card-shaped placeholder shown while the videos list is initially
 * loading. Same dimensions as a real <VideoCard/> so the grid doesn't
 * jump when data arrives. Uses Tailwind's animate-pulse on muted bg
 * so it visually reads as "content is on the way" instead of a
 * full-screen spinner ("the page is broken").
 */
export function VideoCardSkeleton() {
  return (
    <div className="block border rounded-xl overflow-hidden bg-card">
      <div className="aspect-video bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-4/5 bg-muted animate-pulse rounded" />
        <div className="h-3 w-1/3 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}
