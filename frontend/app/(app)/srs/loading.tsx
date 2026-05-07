export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="h-32 w-72 rounded-2xl bg-muted animate-pulse" />
      <div className="h-3 w-48 rounded bg-muted animate-pulse" />
    </div>
  );
}
