import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowLeft,
  Loader2,
  Trash2,
  DoorOpen,
  Lightbulb,
} from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  RoomBlock,
  DeviceCard,
  DeviceControlDrawer,
  AddDeviceDialog,
} from "@/components/devices";
import { HomeService } from "@/services/HomeService";
import type { Room } from "@/models";

export const Route = createFileRoute("/homes/$homeId")({
  component: HomeDetailPage,
});

function HomeDetailPage() {
  const { homeId } = Route.useParams();
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isDeviceDrawerOpen, setIsDeviceDrawerOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [addDeviceRoomId, setAddDeviceRoomId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: home, isLoading: isLoadingHome } = useQuery({
    queryKey: ["home", homeId],
    queryFn: () => HomeService.getInstance().getHome(homeId),
  });

  const { data: allRooms = [], isLoading: isLoadingRooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => HomeService.getInstance().getRooms(),
  });

  const { data: devices = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ["home-devices", homeId],
    queryFn: () => HomeService.getInstance().getHomeDevices(homeId),
    // Stable sort by ID to prevent card position swapping on refresh
    select: (data) => [...data].sort((a, b) => a.id.localeCompare(b.id)),
  });

  // Derive selectedDevice from fresh query data instead of stale state
  const selectedDevice = selectedDeviceId
    ? (devices.find((d) => d.id === selectedDeviceId) ?? null)
    : null;

  // Filter rooms for this home and populate their devices
  const rooms = allRooms
    .filter((r) => r.homeId === homeId)
    .map((room) => {
      // Assign devices that belong to this room (match by room name)
      room.devices = devices.filter((d) => d.roomName === room.name);
      return room;
    });

  const createRoomMutation = useMutation({
    mutationFn: (name: string) =>
      HomeService.getInstance().createRoom(name, homeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setIsCreateRoomOpen(false);
      setNewRoomName("");
      toast.success("Room created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create room: ${error.message}`);
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id: string) => HomeService.getInstance().deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setSelectedRoom(null);
      toast.success("Room deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete room: ${error.message}`);
    },
  });

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      createRoomMutation.mutate(newRoomName.trim());
    }
  };

  const handleAddDevice = (roomId: string) => {
    setAddDeviceRoomId(roomId);
    setIsAddDeviceOpen(true);
  };

  const isLoading = isLoadingHome || isLoadingRooms;

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
            <h1 className="text-2xl font-bold">
              {isLoadingHome ? "Loading..." : home?.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {rooms.length} rooms · {devices.length} devices
            </p>
          </div>
        </div>

        <Dialog open={isCreateRoomOpen} onOpenChange={setIsCreateRoomOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Room</DialogTitle>
              <DialogDescription>
                Create a new room in this home.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Room name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateRoomOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateRoom}
                disabled={!newRoomName.trim() || createRoomMutation.isPending}
              >
                {createRoomMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Rooms section */}
      {!isLoading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <DoorOpen className="h-5 w-5" />
              Rooms
            </h2>
            <p className="text-sm text-muted-foreground">
              💡 Click on a room to add devices
            </p>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DoorOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No rooms yet. Add your first room!</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {rooms.map((room) => (
                <div key={room.id} className="relative group">
                  <RoomBlock
                    room={room}
                    onClick={() => handleAddDevice(room.id)}
                    isSelected={selectedRoom?.id === room.id}
                  />

                  {/* Delete button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Room?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete "{room.name}" and all devices in it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteRoomMutation.mutate(room.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Devices section */}
      {!isLoadingDevices && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            All Devices in This Home
          </h2>

          {devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No devices yet. Click a room to add devices!</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onControl={() => {
                    setSelectedDeviceId(device.id);
                    setIsDeviceDrawerOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Device Control Drawer */}
      <DeviceControlDrawer
        device={selectedDevice}
        open={isDeviceDrawerOpen}
        onOpenChange={(open) => {
          setIsDeviceDrawerOpen(open);
          // Refresh devices when drawer closes to sync state
          if (!open) {
            queryClient.invalidateQueries({
              queryKey: ["home-devices", homeId],
            });
          }
        }}
        onUpdate={() => {
          queryClient.invalidateQueries({
            queryKey: ["home-devices", homeId],
          });
        }}
      />

      {/* Add Device Dialog */}
      {addDeviceRoomId && (
        <AddDeviceDialog
          open={isAddDeviceOpen}
          onOpenChange={setIsAddDeviceOpen}
          roomId={addDeviceRoomId}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["home-devices", homeId],
            });
          }}
        />
      )}
    </div>
  );
}
