import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lightbulb, Filter, Tv, Fan, Snowflake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DeviceCard,
  DeviceControlDrawer,
  DevicesListSkeleton,
  ErrorState,
  EmptyState,
} from "@/components/devices";
import { DeviceService } from "@/services/DeviceService";
import { DeviceType } from "@/types/device.types";
import type { BaseDevice } from "@/models";

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

const deviceIcons = {
  [DeviceType.Lightbulb]: Lightbulb,
  [DeviceType.Television]: Tv,
  [DeviceType.Fan]: Fan,
  [DeviceType.AirConditioner]: Snowflake,
};

function DevicesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedDevice, setSelectedDevice] = useState<BaseDevice | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<BaseDevice | null>(null);
  const queryClient = useQueryClient();

  const {
    data: devices = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: () => DeviceService.getInstance().getAllDevices(),
    // Stable sort by ID to prevent card position swapping on refresh
    select: (data) => [...data].sort((a, b) => a.id.localeCompare(b.id)),
  });

  const deleteMutation = useMutation({
    mutationFn: (device: BaseDevice) =>
      DeviceService.getInstance().deleteDevice(device.type, device.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Device deleted successfully");
      setDeviceToDelete(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete device: ${error.message}`);
    },
  });

  // Filter devices
  const filteredDevices = devices.filter((device) => {
    const matchesSearch = device.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || device.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Group by type for stats
  const devicesByType = devices.reduce(
    (acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const handleControlDevice = (device: BaseDevice) => {
    setSelectedDevice(device);
    setIsDrawerOpen(true);
  };

  const handleDeviceUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">All Devices</h1>
        </div>
        <ErrorState
          title="Failed to load devices"
          message="We couldn't fetch your devices. Please try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">All Devices</h1>
            <p className="text-muted-foreground text-sm">
              {devices.length} devices across all homes
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search devices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value={DeviceType.Lightbulb}>Lightbulbs</SelectItem>
            <SelectItem value={DeviceType.Television}>TVs</SelectItem>
            <SelectItem value={DeviceType.Fan}>Fans</SelectItem>
            <SelectItem value={DeviceType.AirConditioner}>ACs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats cards */}
      {!isLoading && Object.keys(devicesByType).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(devicesByType).map(([type, count]) => {
            const Icon = deviceIcons[type as DeviceType] || Lightbulb;
            return (
              <div
                key={type}
                className="rounded-lg border bg-card p-3 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{count}</p>
                  <p className="text-xs text-muted-foreground">{type}s</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {isLoading && <DevicesListSkeleton />}

      {/* Empty */}
      {!isLoading && devices.length === 0 && (
        <EmptyState
          icon={<Lightbulb className="h-8 w-8 text-muted-foreground" />}
          title="No devices yet"
          description="Add devices to your rooms to see them here."
          action={
            <Button asChild>
              <Link to="/homes">Go to Homes</Link>
            </Button>
          }
        />
      )}

      {/* No results */}
      {!isLoading && devices.length > 0 && filteredDevices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No devices match your search.
        </div>
      )}

      {/* Devices grid */}
      {!isLoading && filteredDevices.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onControl={() => handleControlDevice(device)}
              onDelete={() => setDeviceToDelete(device)}
            />
          ))}
        </div>
      )}

      {/* Device Control Drawer */}
      <DeviceControlDrawer
        device={selectedDevice}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onUpdate={handleDeviceUpdate}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deviceToDelete}
        onOpenChange={(open) => !open && setDeviceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deviceToDelete?.name}". This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deviceToDelete && deleteMutation.mutate(deviceToDelete)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
