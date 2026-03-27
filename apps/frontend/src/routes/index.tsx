import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Home as HomeIcon, Loader2, DoorOpen } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { RenameDialog } from "@/components/ui/rename-dialog";
import { HomeBlock, RoomBlock } from "@/components/devices";
import { useHomeStore } from "@/stores/home_store";
import { useUIStore } from "@/stores/ui_store";
import { HomeService } from "@/services/HomeService";
import type { Home, Room } from "@/models";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { homes, isLoadingHomes, error, fetchHomes, rooms, isLoadingRooms, fetchRooms } = useHomeStore();
  const setModalOpen = useUIStore((s) => s.set_modal_open);
  const [homeToDelete, setHomeToDelete] = useState<Home | null>(null);
  const [homeToRename, setHomeToRename] = useState<Home | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newHomeName, setNewHomeName] = useState("");
  const [roomsWithDevices, setRoomsWithDevices] = useState<Room[]>([]);
  const [isLoadingRoomDevices, setIsLoadingRoomDevices] = useState(false);

  useEffect(() => {
    fetchHomes();
    fetchRooms();
  }, [fetchHomes, fetchRooms]);

  // Fetch devices for each room
  useEffect(() => {
    const loadRoomDevices = async () => {
      if (rooms.length === 0) {
        setRoomsWithDevices([]);
        return;
      }

      setIsLoadingRoomDevices(true);
      try {
        const roomsWithDevicesData = await Promise.all(
          rooms.map(async (room) => {
            const devices = await HomeService.getInstance().getRoomDevices(room.id);
            room.devices = devices;
            return room;
          })
        );
        setRoomsWithDevices(roomsWithDevicesData);
      } catch (err) {
        console.error("Failed to fetch room devices:", err);
        setRoomsWithDevices(rooms);
      } finally {
        setIsLoadingRoomDevices(false);
      }
    };

    if (!isLoadingRooms) {
      loadRoomDevices();
    }
  }, [rooms, isLoadingRooms]);

  useEffect(() => {
    const open = isCreateOpen || !!homeToDelete || !!homeToRename;
    setModalOpen(open);
    return () => setModalOpen(false);
  }, [isCreateOpen, homeToDelete, homeToRename, setModalOpen]);

  const createMutation = useMutation({
    mutationFn: (name: string) => HomeService.getInstance().createHome(name),
    onSuccess: () => {
      fetchHomes();
      setIsCreateOpen(false);
      setNewHomeName("");
      toast.success("Home created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create home: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => HomeService.getInstance().deleteHome(id),
    onSuccess: () => {
      fetchHomes();
      setHomeToDelete(null);
      toast.success("Home deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete home: ${error.message}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      HomeService.getInstance().renameHome(id, name),
    onSuccess: () => {
      fetchHomes();
      setHomeToRename(null);
      toast.success("Home renamed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rename home: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (newHomeName.trim()) {
      createMutation.mutate(newHomeName.trim());
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your smart homes and devices
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Home
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Home</DialogTitle>
              <DialogDescription>Give your new home a name.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Home name (e.g., My House)"
                value={newHomeName}
                onChange={(e) => setNewHomeName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newHomeName.trim() || createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoadingHomes && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoadingHomes && homes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <HomeIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No homes yet</h2>
          <p className="text-muted-foreground mb-4 max-w-sm">
            Create your first smart home to start managing your devices.
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Home
          </Button>
        </div>
      )}

      {/* Homes grid */}
      {!isLoadingHomes && homes.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <HomeIcon className="h-5 w-5" />
            Your Homes
          </h2>
          <div className="flex flex-wrap gap-6">
            {homes.map((home) => (
              <HomeBlock
                key={home.id}
                home={home}
                onDelete={() => setHomeToDelete(home)}
                onRename={() => setHomeToRename(home)}
              />
            ))}

            {/* Add home card - same size as HomeBlock */}
            <div
              onClick={() => setIsCreateOpen(true)}
              className="w-44 h-[144px] rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">Add Home</span>
            </div>
          </div>
        </div>
      )}

      {/* Rooms grid */}
      {!isLoadingRooms && !isLoadingRoomDevices && roomsWithDevices.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <DoorOpen className="h-5 w-5" />
            Your Rooms
          </h2>
          <div className="flex flex-wrap gap-4">
            {roomsWithDevices.map((room) => (
              <Link
                key={room.id}
                to="/homes/$homeId"
                params={{ homeId: room.homeId }}
                search={{ room: room.id }}
                className="block"
              >
                <RoomBlock room={room} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      {!isLoadingHomes && homes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Total Homes"
            value={homes.length}
            icon={<HomeIcon className="h-5 w-5" />}
          />
          <StatCard
            label="Total Rooms"
            value={homes.reduce((sum, h) => sum + h.roomCount, 0)}
            icon={<HomeIcon className="h-5 w-5" />}
          />
          <StatCard
            label="Total Devices"
            value={homes.reduce((sum, h) => sum + h.deviceCount, 0)}
            icon={<HomeIcon className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!homeToDelete}
        onOpenChange={(open) => !open && setHomeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Home?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{homeToDelete?.name}" and all its
              rooms and devices. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                homeToDelete && deleteMutation.mutate(homeToDelete.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Home Dialog */}
      <RenameDialog
        open={!!homeToRename}
        onOpenChange={(open) => !open && setHomeToRename(null)}
        currentName={homeToRename?.name || ""}
        title="Rename Home"
        description="Enter a new name for this home."
        onSave={(newName) =>
          homeToRename &&
          renameMutation.mutate({ id: homeToRename.id, name: newName })
        }
        isPending={renameMutation.isPending}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
