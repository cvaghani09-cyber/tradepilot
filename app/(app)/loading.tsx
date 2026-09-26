import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Skeleton className="h-72 xl:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
