export function SrsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between gap-4">
        <div className="h-4 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-32" />
      </div>
      <div className="border rounded-xl bg-card min-h-[320px]" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}
