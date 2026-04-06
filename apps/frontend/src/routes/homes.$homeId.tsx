import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Plus,
  ArrowLeft,
  Loader2,
  DoorOpen,
  Lightbulb,
  Armchair,
  Pencil,
  Trash2,
  Upload,
  Box,
  X,
  CheckCircle2,
  User,
  Bot,
  FileText,
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
import type { AvatarScriptDTO } from "@/types/home.types";
import { DeviceType } from "@/types/device.types";
import { useUIStore } from "@/stores/ui_store";
import { cn } from "@/lib/utils";

const ROOM_MODELS = [
  { value: "LabPlan", label: "Lab Plan (Default)" },
] as const;

/** Avatars spawned in 3D for this room (ids must match scene-creator). */
const ROOM_PAGE_AVATARS = [
  { id: "npc1", label: "Alice", type: "npc" as const },
  { id: "npc2", label: "Bob", type: "npc" as const },
  { id: "npc3", label: "Carol", type: "npc" as const },
  { id: "robot1", label: "Robot", type: "robot" as const },
] as const;
type RoomPageAvatar = (typeof ROOM_PAGE_AVATARS)[number];

function avatarApiName(entry: RoomPageAvatar): string {
  if (entry.type === "robot") return "Robot Assistant";
  return `${entry.label} (NPC)`;
}

const AVATAR_SCRIPT_JSON_EXAMPLE = `[
  { "type": "walk", "target": [0.5, -0.5], "speed": 0.4 },
  { "type": "wait", "duration": 2 },
  { "type": "wave" },
  { "type": "sit", "duration": 5 },
  { "type": "idle", "duration": 2 }
]`;

const homeSearchSchema = z.object({
  room: z.string().optional(),
});

export const Route = createFileRoute("/homes/$homeId")({
  validateSearch: homeSearchSchema,
  component: HomeDetailPage,
});

function HomeDetailPage() {
  const { homeId } = Route.useParams();
  const { room: selectedRoomId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setModalOpen = useUIStore((s) => s.set_modal_open);
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomModel, setNewRoomModel] = useState("LabPlan");
  const [newRoomModelFile, setNewRoomModelFile] = useState<File | null>(null);
  const [roomToRename, setRoomToRename] = useState<Room | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deviceToRename, setDeviceToRename] = useState<BaseDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<BaseDevice | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isDeviceDrawerOpen, setIsDeviceDrawerOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [addDeviceRoomId, setAddDeviceRoomId] = useState<string | null>(null);
  const [furnitureToRename, setFurnitureToRename] =
    useState<FurnitureItem | null>(null);
  const [furnitureToDelete, setFurnitureToDelete] =
    useState<FurnitureItem | null>(null);
  const [avatarScriptModalEntry, setAvatarScriptModalEntry] =
    useState<RoomPageAvatar | null>(null);
  const [avatarScriptPendingFile, setAvatarScriptPendingFile] =
    useState<File | null>(null);
  const [avatarScriptDropActive, setAvatarScriptDropActive] = useState(false);
  const avatarScriptFileInputRef = useRef<HTMLInputElement>(null);
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
      isDeviceDrawerOpen ||
      !!avatarScriptModalEntry;
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
    avatarScriptModalEntry,
    setModalOpen,
  ]);

  const closeAvatarScriptModal = () => {
    setAvatarScriptModalEntry(null);
    setAvatarScriptPendingFile(null);
    setAvatarScriptDropActive(false);
  };

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
        const roomFurniture = await HomeService.getInstance().getRoomFurniture(
          room.id,
        );
        results.push(...roomFurniture);
      }
      return results;
    },
    enabled: allRooms.length > 0,
  });

  const { data: avatarScripts = [], isLoading: isLoadingAvatarScripts } =
    useQuery({
      queryKey: ["avatar-scripts", selectedRoomId],
      queryFn: () =>
        HomeService.getInstance().getRoomAvatarScripts(selectedRoomId!),
      enabled: !!selectedRoomId,
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

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;
  const filteredDevices = selectedRoom
    ? devices.filter((d) => d.roomName === selectedRoom.name)
    : devices;
  const filteredFurniture = selectedRoom
    ? furniture.filter((f) => f.roomName === selectedRoom.name)
    : furniture;

  const createRoomMutation = useMutation({
    mutationFn: async ({
      name,
      roomModel,
      modelFile,
    }: {
      name: string;
      roomModel: string;
      modelFile?: File | null;
    }) => {
      // Create room first
      const room = await HomeService.getInstance().createRoom(
        name,
        homeId,
        roomModel,
      );
      // Upload model file if provided
      if (modelFile) {
        await HomeService.getInstance().uploadRoomModel(room.id, modelFile);
      }
      return room;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setIsCreateRoomOpen(false);
      setNewRoomName("");
      setNewRoomModel("LabPlan");
      setNewRoomModelFile(null);
      // Reset file input
      const fileInput = document.getElementById(
        "room-model-file",
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
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
      setRoomToDelete(null);
      toast.success("Room deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete room: ${error.message}`);
    },
  });

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      createRoomMutation.mutate({
        name: newRoomName.trim(),
        roomModel: newRoomModel,
        modelFile: newRoomModelFile,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validExtensions = [".gltf", ".glb", ".zip"];
      const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."));
      if (!validExtensions.includes(fileExtension)) {
        toast.error(
          "Invalid file type. Please upload a GLTF, GLB file, or ZIP archive containing the model folder.",
        );
        return;
      }

      // Validate file size (100MB max for ZIP, 50MB for single files)
      const maxSize =
        fileExtension === ".zip"
          ? 100 * 1024 * 1024 // 100MB for ZIP
          : 50 * 1024 * 1024; // 50MB for single files
      if (file.size > maxSize) {
        toast.error(
          `File too large. Please upload a file smaller than ${fileExtension === ".zip" ? "100MB" : "50MB"}.`,
        );
        return;
      }

      setNewRoomModelFile(file);
      // Clear the dropdown selection when a file is uploaded
      setNewRoomModel("LabPlan");
      toast.success(
        fileExtension === ".zip"
          ? "ZIP archive selected. It will be extracted on upload."
          : "3D model file selected successfully",
      );
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

  const uploadAvatarScriptMutation = useMutation({
    mutationFn: ({
      roomId,
      entry,
      file,
    }: {
      roomId: string;
      entry: RoomPageAvatar;
      file: File;
    }) =>
      HomeService.getInstance().uploadAvatarScript(
        roomId,
        entry.id,
        avatarApiName(entry),
        entry.type,
        file,
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["avatar-scripts", vars.roomId],
      });
      setAvatarScriptPendingFile(null);
      toast.success("Behavior script saved");
    },
    onError: (error) => {
      toast.error(`Upload failed: ${(error as Error).message}`);
    },
  });

  const deleteAvatarScriptMutation = useMutation({
    mutationFn: (id: string) =>
      HomeService.getInstance().deleteAvatarScript(id),
    onSuccess: () => {
      if (selectedRoomId) {
        queryClient.invalidateQueries({
          queryKey: ["avatar-scripts", selectedRoomId],
        });
      }
      toast.success("Script removed");
    },
    onError: (error) => {
      toast.error(`Failed to remove script: ${(error as Error).message}`);
    },
  });



  const handleDragStart = (
    e: React.DragEvent,
    deviceId: string,
    deviceType: string,
  ) => {
    e.dataTransfer.setData("deviceId", deviceId);
    e.dataTransfer.setData("deviceType", deviceType);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDeviceDrop = async (
    deviceId: string,
    deviceType: string,
    targetRoomId: string,
  ) => {
    try {
      const deviceService = DeviceService.getInstance();
      await deviceService.updateRoom(deviceType, deviceId, targetRoomId);
      await deviceService.resetPosition(deviceType, deviceId);

      toast.success("Device moved successfully");
      queryClient.invalidateQueries({ queryKey: ["home-devices", homeId] });
      queryClient.invalidateQueries({ queryKey: ["home-rooms", homeId] });
    } catch (error) {
      toast.error(`Failed to move device: ${(error as Error).message}`);
    }
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
            <h1
              className="text-2xl font-bold cursor-pointer hover:text-primary transition-all duration-200"
              onClick={() => navigate({ search: { room: undefined } })}
              title="Click to see all devices in this home"
            >
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
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="e.g., Living Room, Bedroom, Kitchen"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
                />
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    3D Model Configuration
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="room-model" className="text-base font-semibold">
                  Pre-built Models
                </Label>
                <Select
                  value={newRoomModel}
                  onValueChange={(value) => {
                    setNewRoomModel(value);
                    // Clear file when selecting from dropdown
                    setNewRoomModelFile(null);
                  }}
                  disabled={!!newRoomModelFile || createRoomMutation.isPending}
                >
                  <SelectTrigger
                    className={newRoomModelFile ? "opacity-50" : ""}
                  >
                    <SelectValue placeholder="Select a room model" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4" />
                          {model.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newRoomModelFile && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <X className="h-3 w-3" />
                    Custom model selected - pre-built model disabled
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or Upload Custom Model
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="room-model-file"
                  className="text-base font-semibold"
                >
                  Upload Custom 3D Model
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (Optional)
                  </span>
                </Label>

                {!newRoomModelFile ? (
                  <div className="relative">
                    <Input
                      id="room-model-file"
                      type="file"
                      accept=".gltf,.glb,.zip"
                      onChange={handleFileChange}
                      disabled={createRoomMutation.isPending}
                      className="sr-only"
                    />
                    <label
                      htmlFor="room-model-file"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80 transition-colors group"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-10 h-10 mb-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <p className="mb-2 text-sm text-foreground font-medium">
                          <span className="font-semibold">Click to upload</span>{" "}
                          or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                          GLTF, GLB file, or ZIP archive (max 50MB/100MB)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          ZIP files will be extracted automatically
                        </p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="relative rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5 p-2 rounded-md bg-primary/10">
                          <Box className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate">
                              {newRoomModelFile.name}
                            </p>
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(newRoomModelFile.size / 1024 / 1024).toFixed(2)}{" "}
                            MB
                            {" · "}
                            {newRoomModelFile.name.endsWith(".zip")
                              ? "ZIP Archive"
                              : newRoomModelFile.name.endsWith(".glb")
                                ? "Binary GLTF"
                                : "GLTF"}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => {
                          setNewRoomModelFile(null);
                          const fileInput = document.getElementById(
                            "room-model-file",
                          ) as HTMLInputElement;
                          if (fileInput) {
                            fileInput.value = "";
                          }
                        }}
                        disabled={createRoomMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="rounded-md bg-primary/5 border border-primary/20 p-2">
                      <p className="text-xs text-primary font-medium">
                        ✓ This custom model will override the pre-built model
                        above
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload your own 3D room model in GLTF, GLB format, or as a ZIP
                  archive containing the model folder with all textures and
                  resources. The file will be used when viewing this room in the
                  3D scene creator.
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
                  onClick={() => navigate({ search: { room: room.id } })}
                  isSelected={selectedRoom?.id === room.id}
                  onRename={() => setRoomToRename(room)}
                  onDelete={() => setRoomToDelete(room)}
                  onDrop={(deviceId, deviceType) =>
                    handleDeviceDrop(deviceId, deviceType, room.id)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Devices section */}
      {!isLoadingDevices && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-3">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              {selectedRoom ? (
                <span>
                  Devices in{" "}
                  <span className="text-primary">{selectedRoom.name}</span>
                </span>
              ) : (
                <span>
                  All Devices in{" "}
                  <span className="text-primary">{home?.name}</span>
                </span>
              )}
            </h2>
            {selectedRoom && (
              <Button
                onClick={() => handleAddDevice(selectedRoom.id)}
                size="sm"
                className="shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Device
              </Button>
            )}
          </div>

          {filteredDevices.length === 0 ? (
            <div className="text-center py-12 border rounded-xl bg-card/40 border-border/50">
              <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">
                No devices yet{selectedRoom ? " in this room" : " in this home"}
                .
              </p>
              {selectedRoom && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => handleAddDevice(selectedRoom.id)}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add your first device
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {filteredDevices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onControl={() => {
                    setSelectedDeviceId(device.id);
                    setIsDeviceDrawerOpen(true);
                  }}
                  onRename={() => setDeviceToRename(device)}
                  onDelete={() => setDeviceToDelete(device)}
                  draggable
                  onDragStart={(e) =>
                    handleDragStart(e, device.id, device.type)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Furniture section */}
      {!isLoadingFurniture && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-3">
            <div className="p-1.5 bg-orange-500/10 rounded-lg">
              <Armchair className="h-4 w-4 text-orange-500" />
            </div>
            {selectedRoom ? (
              <span>
                Furniture in{" "}
                <span className="text-orange-500">{selectedRoom.name}</span>
              </span>
            ) : (
              <span>
                All Furniture in{" "}
                <span className="text-orange-500">{home?.name}</span>
              </span>
            )}
          </h2>

          {filteredFurniture.length === 0 ? (
            <div className="text-center py-12 border rounded-xl bg-card/40 border-border/50">
              <Armchair className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">
                No furniture yet
                {selectedRoom ? " in this room" : " in this home"}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Place furniture in the 3D Scene Creator.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {filteredFurniture.map((item) => (
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
                    <h4 className="font-semibold text-sm truncate">
                      {item.name}
                    </h4>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                    {item.roomName && (
                      <p className="text-xs text-muted-foreground/70">
                        {item.roomName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Avatars & behavior scripts — only when a room is selected */}
      {selectedRoom && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-3">
            <div className="p-1.5 bg-sky-500/15 rounded-lg">
              <User className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <span>
              Avatars &amp; Scripts in{" "}
              <span className="text-sky-600 dark:text-sky-400">
                {selectedRoom.name}
              </span>
            </span>
          </h2>
          <div className="-mx-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            <p className="text-sm text-muted-foreground whitespace-nowrap px-1">
              Upload JSON scripts to control how these avatars behave in the 3D
              scene. If no script is uploaded, they will use their default
              behavior.
            </p>
          </div>
          {isLoadingAvatarScripts ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {ROOM_PAGE_AVATARS.map((entry) => {
                const script = avatarScripts.find(
                  (s: AvatarScriptDTO) => s.avatar_id === entry.id,
                );
                const hasScript = Boolean(script?.script_data);
                const Icon = entry.type === "robot" ? Bot : User;
                const titlePrimary =
                  entry.type === "npc" ? `${entry.label} (NPC)` : entry.label;
                const titleSecondary =
                  entry.type === "robot" ? "Assistant" : "NPC";
                return (
                  <div
                    key={entry.id}
                    className="group relative cursor-pointer transform-gpu transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]"
                  >
                    <div
                      className={cn(
                        "relative flex min-h-[200px] flex-col rounded-xl border border-border shadow-md cursor-pointer",
                        "bg-gradient-to-b from-card to-muted/30",
                        "transition-all duration-300",
                        "group-hover:shadow-lg group-hover:border-primary/50",
                      )}
                    >
                      <div className="flex flex-1 flex-col p-5 pt-6">
                        <div className="flex flex-1 gap-4 items-start">
                          <div className="w-12 h-12 shrink-0 rounded-xl bg-sky-500/15 flex items-center justify-center border border-sky-500/20">
                            <Icon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                          </div>
                          <div className="min-w-0 flex-1 pt-1 space-y-1">
                            <h4 className="font-semibold text-base text-foreground leading-snug truncate">
                              {titlePrimary}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {titleSecondary}
                            </p>
                          </div>
                        </div>

                        <div className="mt-auto border-t border-border/60 pt-4">
                          {hasScript ? (
                            <div className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 sm:w-auto sm:justify-start">
                              <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              Script Active
                            </div>
                          ) : (
                            <div className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-muted/90 border border-muted-foreground/20 px-3 py-2 text-xs font-medium text-muted-foreground sm:w-auto sm:justify-start">
                              <FileText className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                              Default Behavior
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="absolute -top-2 -right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-6 w-6 shadow-md hover:scale-110 transition-transform"
                        title="Upload or edit script"
                        onClick={() => setAvatarScriptModalEntry(entry)}
                      >
                        <Upload className="h-3 w-3 text-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Avatar script upload modal */}
      <Dialog
        open={!!avatarScriptModalEntry}
        onOpenChange={(open) => {
          if (!open) {
            closeAvatarScriptModal();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left pr-8">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Upload className="h-4 w-4" />
              </span>
              <span>
                {avatarScriptModalEntry
                  ? `Upload Script for ${
                      avatarScriptModalEntry.type === "npc"
                        ? `${avatarScriptModalEntry.label} (NPC)`
                        : `${avatarScriptModalEntry.label} (Robot)`
                    }`
                  : "Upload script"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-left space-y-1">
              {avatarScriptModalEntry ? (
                <>
                  <span>
                    Upload a JSON file containing the behavior script for this{" "}
                    {avatarScriptModalEntry.type}.
                  </span>
                  <span className="block text-muted-foreground">
                    Walk <code className="text-xs">target</code> is{" "}
                    <code className="text-xs">[x, z]</code> in room-local floor
                    space (inside the room bounds). Scripts pause during NPC
                    voice chat when you are in range.
                  </span>
                </>
              ) : (
                ""
              )}
            </DialogDescription>
          </DialogHeader>
          {avatarScriptModalEntry && selectedRoom && (
            <div className="space-y-4 py-1">
              {(() => {
                const existing = avatarScripts.find(
                  (s: AvatarScriptDTO) =>
                    s.avatar_id === avatarScriptModalEntry.id,
                );
                const assignScriptFile = (file: File | null) => {
                  if (!file) return;
                  const ok =
                    file.name.toLowerCase().endsWith(".json") ||
                    file.name.toLowerCase().endsWith(".txt") ||
                    file.type === "application/json" ||
                    file.type === "text/plain";
                  if (!ok) {
                    toast.error("Please choose a .json or .txt file.");
                    return;
                  }
                  setAvatarScriptPendingFile(file);
                };

                return (
                  <>
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                        Example script format (adjust walk targets to your
                        room):
                      </p>
                      <pre className="text-[11px] leading-relaxed overflow-x-auto text-foreground/90 font-mono">
                        {AVATAR_SCRIPT_JSON_EXAMPLE}
                      </pre>
                    </div>

                    {existing?.script_data != null && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          Current script on server
                        </p>
                        <div className="rounded-md border bg-muted/30 p-3 max-h-36 overflow-auto">
                          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                            {JSON.stringify(existing.script_data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <input
                        ref={avatarScriptFileInputRef}
                        id="avatar-script-modal-file"
                        type="file"
                        accept=".json,.txt,application/json,text/plain"
                        className="sr-only"
                        disabled={uploadAvatarScriptMutation.isPending}
                        onChange={(e) => {
                          assignScriptFile(e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="avatar-script-modal-file"
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setAvatarScriptDropActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setAvatarScriptDropActive(true);
                        }}
                        onDragLeave={() => setAvatarScriptDropActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setAvatarScriptDropActive(false);
                          assignScriptFile(e.dataTransfer.files?.[0] ?? null);
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center w-full min-h-[8rem] cursor-pointer rounded-lg border-2 border-dashed transition-colors group/drop",
                          "border-border bg-muted/50 hover:bg-muted/80",
                          avatarScriptDropActive &&
                            "bg-muted/90 border-muted-foreground/35",
                        )}
                      >
                        <div className="flex flex-col items-center justify-center py-6 px-4">
                          <Upload className="w-10 h-10 mb-3 text-muted-foreground group-hover/drop:text-foreground transition-colors" />
                          <p className="mb-1 text-sm text-foreground text-center">
                            <span className="font-semibold">
                              Click to upload
                            </span>{" "}
                            or drag and drop
                          </p>
                          <p className="text-xs text-muted-foreground text-center">
                            JSON or TXT behavior script
                          </p>
                          {avatarScriptPendingFile && (
                            <p className="text-xs text-foreground font-medium mt-3 text-center">
                              Selected: {avatarScriptPendingFile.name}
                            </p>
                          )}
                        </div>
                      </label>
                    </div>

                    {existing && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={deleteAvatarScriptMutation.isPending}
                        onClick={() =>
                          deleteAvatarScriptMutation.mutate(existing.id, {
                            onSuccess: () => {
                              closeAvatarScriptModal();
                            },
                          })
                        }
                      >
                        Remove script from server
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end sm:gap-4">
            <Button
              variant="outline"
              className="sm:min-w-[100px]"
              onClick={() => {
                closeAvatarScriptModal();
              }}
            >
              Cancel
            </Button>
            <Button
              className="sm:min-w-[100px]"
              disabled={
                !avatarScriptPendingFile ||
                uploadAvatarScriptMutation.isPending ||
                !avatarScriptModalEntry ||
                !selectedRoom
              }
              onClick={() => {
                if (
                  !avatarScriptPendingFile ||
                  !avatarScriptModalEntry ||
                  !selectedRoom
                )
                  return;
                uploadAvatarScriptMutation.mutate({
                  roomId: selectedRoom.id,
                  entry: avatarScriptModalEntry,
                  file: avatarScriptPendingFile,
                });
              }}
            >
              {uploadAvatarScriptMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="bg-red-500 hover:bg-red-600 text-white"
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
              className="bg-red-500 hover:bg-red-600 text-white"
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
          renameFurnitureMutation.mutate({
            id: furnitureToRename.id,
            name: newName,
          })
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
              className="bg-red-500 hover:bg-red-600 text-white"
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
