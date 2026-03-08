import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowLeft,
  Loader2,
  DoorOpen,
  Lightbulb,
  Armchair,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { FurnitureItem } from "@/models/Room";
import { DeviceType } from "@/types/device.types";
import { useUIStore } from "@/stores/ui_store";

const ROOM_MODELS = [
  { value: "LabPlan", label: "Lab Plan (Default)" },
] as const;

export const Route = createFileRoute("/homes/$homeId")({
  component: HomeDetailPage,
});

function HomeDetailPage() {
  const { homeId } = Route.useParams();
  const setModalOpen = useUIStore((s) => s.set_modal_open);
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomModel, setNewRoomModel] = useState("LabPlan");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomToRename, setRoomToRename] = useState<Room | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deviceToRename, setDeviceToRename] = useState<BaseDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<BaseDevice | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isDeviceDrawerOpen, setIsDeviceDrawerOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [addDeviceRoomId, setAddDeviceRoomId] = useState<string | null>(null);
  const [furnitureToRename, setFurnitureToRename] = useState<FurnitureItem | null>(null);
  const [furnitureToDelete, setFurnitureToDelete] = useState<FurnitureItem | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const open =
      isCreateRoomOpen ||
      !!roomToRename ||
      !!roomToDelete ||
      !!deviceToRename ||
      !!deviceToDelete ||
      !!furnitureToRename ||
      !!furnitureToDelete ||
      isAddDeviceOpen ||
      isDeviceDrawerOpen;
    setModalOpen(open);
    return () => setModalOpen(false);
  }, [
    isCreateRoomOpen,
    roomToRename,
    roomToDelete,
    deviceToRename,
    deviceToDelete,
    furnitureToRename,
    furnitureToDelete,
    isAddDeviceOpen,
    isDeviceDrawerOpen,
    setModalOpen,
  ]);

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

  const { data: furniture = [], isLoading: isLoadingFurniture } = useQuery({
    queryKey: ["home-furniture", homeId],
    queryFn: async () => {
      // Fetch furniture for all rooms of this home
      const homeRooms = allRooms.filter((r) => r.homeId === homeId);
      const results: FurnitureItem[] = [];
      for (const room of homeRooms) {
        const roomFurniture = await HomeService.getInstance().getRoomFurniture(room.id);
        results.push(...roomFurniture);
      }
      return results;
    },
    enabled: allRooms.length > 0,
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
      // Assign furniture that belong to this room
      room.furniture = furniture.filter((f) => f.roomName === room.name);
      return room;
    });

  const createRoomMutation = useMutation({
    mutationFn: ({ name, roomModel }: { name: string; roomModel: string }) =>
      HomeService.getInstance().createRoom(name, homeId, roomModel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setIsCreateRoomOpen(false);
      setNewRoomName("");
      setNewRoomModel("LabPlan");
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
      createRoomMutation.mutate({ name: newRoomName.trim(), roomModel: newRoomModel });
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

  const renameFurnitureMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      HomeService.getInstance().renameFurniture(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-furniture", homeId] });
      setFurnitureToRename(null);
      toast.success("Furniture renamed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rename furniture: ${error.message}`);
    },
  });

  const deleteFurnitureMutation = useMutation({
    mutationFn: (id: string) => HomeService.getInstance().deleteFurniture(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-furniture", homeId] });
      setFurnitureToDelete(null);
      toast.success("Furniture deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete furniture: ${error.message}`);
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
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="e.g., Living Room"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-model">3D Room Model</Label>
                <Select value={newRoomModel} onValueChange={setNewRoomModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a room model" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose the 3D model for the room in the scene creator. Defaults to Lab Plan.
                </p>
              </div>
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

      {/* Furniture section */}
      {!isLoadingFurniture && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Armchair className="h-5 w-5" />
            Furniture
          </h2>

          {furniture.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Armchair className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No furniture yet. Place furniture in the 3D World!</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {furniture.map((item) => (
                <div
                  key={item.id}
                  className="group relative p-4 rounded-xl border bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/20 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                >
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 shadow-md bg-background/80 backdrop-blur-sm hover:bg-background hover:scale-110 transition-all duration-200"
                      onClick={() => setFurnitureToRename(item)}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-7 w-7 shadow-md opacity-90 hover:opacity-100 hover:scale-110 transition-all duration-200"
                      onClick={() => setFurnitureToDelete(item)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Icon */}
                  <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center mb-3">
                    <Armchair className="h-6 w-6 text-orange-500" />
                  </div>

                  {/* Info */}
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm truncate">{item.name}</h4>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                    {item.roomName && (
                      <p className="text-xs text-muted-foreground/70">{item.roomName}</p>
                    )}
                  </div>
                </div>
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

      {/* Rename Furniture Dialog */}
      <RenameDialog
        open={!!furnitureToRename}
        onOpenChange={(open) => !open && setFurnitureToRename(null)}
        currentName={furnitureToRename?.name || ""}
        title="Rename Furniture"
        description="Enter a new name for this furniture."
        onSave={(newName) =>
          furnitureToRename &&
          renameFurnitureMutation.mutate({ id: furnitureToRename.id, name: newName })
        }
        isPending={renameFurnitureMutation.isPending}
      />

      {/* Delete Furniture Confirmation */}
      <AlertDialog
        open={!!furnitureToDelete}
        onOpenChange={(open) => !open && setFurnitureToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Furniture?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{furnitureToDelete?.name}". This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                furnitureToDelete &&
                deleteFurnitureMutation.mutate(furnitureToDelete.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteFurnitureMutation.isPending}
            >
              {deleteFurnitureMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
