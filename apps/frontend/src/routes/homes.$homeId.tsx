import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowLeft, Loader2, DoorOpen, Lightbulb } from "lucide-react";
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
import {
  RoomBlock,
  DeviceCard,
  DeviceControlDrawer,
  AddDeviceDialog,
} from "@/components/devices";
import { HomeService } from "@/services/HomeService";
import { DeviceService } from "@/services/DeviceService";
import type { Room, BaseDevice } from "@/models";
import { DeviceType } from "@/types/device.types";

export const Route = createFileRoute("/homes/$homeId")({
  component: HomeDetailPage,
});

function HomeDetailPage() {
  const { homeId } = Route.useParams();
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomToRename, setRoomToRename] = useState<Room | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deviceToRename, setDeviceToRename] = useState<BaseDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<BaseDevice | null>(null);
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
      setRoomToDelete(null);
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

  const renameRoomMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      HomeService.getInstance().renameRoom(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["home-devices", homeId] });
      setRoomToRename(null);
      toast.success("Room renamed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rename room: ${error.message}`);
    },
  });

  const renameDeviceMutation = useMutation({
    mutationFn: ({
      type,
      id,
      name,
    }: {
      type: DeviceType;
      id: string;
      name: string;
    }) => DeviceService.getInstance().renameDevice(type, id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-devices", homeId] });
      setDeviceToRename(null);
      toast.success("Device renamed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rename device: ${error.message}`);
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (device: BaseDevice) =>
      DeviceService.getInstance().deleteDevice(device.type, device.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["home-devices", homeId] });
      setDeviceToDelete(null);
      toast.success("Device deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete device: ${error.message}`);
    },
  });

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
                <RoomBlock
                  key={room.id}
                  room={room}
                  onClick={() => handleAddDevice(room.id)}
                  isSelected={selectedRoom?.id === room.id}
                  onRename={() => setRoomToRename(room)}
                  onDelete={() => setRoomToDelete(room)}
                />
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
                  onRename={() => setDeviceToRename(device)}
                  onDelete={() => setDeviceToDelete(device)}
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

      {/* Rename Room Dialog */}
      <RenameDialog
        open={!!roomToRename}
        onOpenChange={(open) => !open && setRoomToRename(null)}
        currentName={roomToRename?.name || ""}
        title="Rename Room"
        description="Enter a new name for this room."
        onSave={(newName) =>
          roomToRename &&
          renameRoomMutation.mutate({ id: roomToRename.id, name: newName })
        }
        isPending={renameRoomMutation.isPending}
      />

      {/* Rename Device Dialog */}
      <RenameDialog
        open={!!deviceToRename}
        onOpenChange={(open) => !open && setDeviceToRename(null)}
        currentName={deviceToRename?.name || ""}
        title="Rename Device"
        description="Enter a new name for this device."
        onSave={(newName) =>
          deviceToRename &&
          renameDeviceMutation.mutate({
            type: deviceToRename.type as DeviceType,
            id: deviceToRename.id,
            name: newName,
          })
        }
        isPending={renameDeviceMutation.isPending}
      />

      {/* Delete Room Confirmation */}
      <AlertDialog
        open={!!roomToDelete}
        onOpenChange={(open) => !open && setRoomToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Room?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{roomToDelete?.name}" and all devices in it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                roomToDelete && deleteRoomMutation.mutate(roomToDelete.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRoomMutation.isPending}
            >
              {deleteRoomMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Device Confirmation */}
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
                deviceToDelete && deleteDeviceMutation.mutate(deviceToDelete)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDeviceMutation.isPending}
            >
              {deleteDeviceMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
