import { Skeleton } from "@/components/ui/skeleton";

export function HomeBlockSkeleton() {
  return (
    <div className="relative w-48 h-40 animate-pulse">
      {/* Top face skeleton */}
      <Skeleton
        className="absolute w-40 h-20 rounded-t-lg"
        style={{ top: "0", left: "20px" }}
      />
      {/* Front face skeleton */}
      <Skeleton
        className="absolute w-40 h-24 rounded-b-lg"
        style={{ bottom: "0", left: "20px" }}
      />
    </div>
  );
}

export function RoomBlockSkeleton() {
  return (
    <div className="w-36 h-28 rounded-lg animate-pulse">
      <Skeleton className="w-full h-full rounded-lg" />
    </div>
  );
}

export function DeviceCardSkeleton() {
  return (
    <div className="p-4 rounded-xl border bg-card animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <Skeleton className="w-8 h-8 rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="mt-3 flex gap-1">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Homes grid skeleton */}
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <div className="flex flex-wrap gap-6">
          <HomeBlockSkeleton />
          <HomeBlockSkeleton />
          <HomeBlockSkeleton />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

export function DevicesListSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <DeviceCardSkeleton />
      <DeviceCardSkeleton />
      <DeviceCardSkeleton />
      <DeviceCardSkeleton />
      <DeviceCardSkeleton />
      <DeviceCardSkeleton />
    </div>
  );
}
