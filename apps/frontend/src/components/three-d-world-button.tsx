import { useState, useEffect } from "react";
import { Box } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useHomeStore } from "@/stores/home_store";
import { useUIStore } from "@/stores/ui_store";
import { HomeService } from "@/services/HomeService";

export function ThreeDWorldButton() {
  const [open, setOpen] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const { homes, fetchHomes, isLoadingHomes } = useHomeStore();
  const setModalOpen = useUIStore((s) => s.set_modal_open);

  const hasNoHome = homes.length === 0;

  const { data: allRooms = [] } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => HomeService.getInstance().getRooms(),
  });

  useEffect(() => {
    if (open && hasNoHome) {
      fetchHomes();
    }
  }, [open, hasNoHome, fetchHomes]);

  // Sync dialog visibility with global modal flag (hides robot assistant)
  useEffect(() => {
    setModalOpen(open);
    return () => setModalOpen(false);
  }, [open, setModalOpen]);

  // Reset room selection when home changes
  useEffect(() => {
    setSelectedRoomId("");
  }, [selectedHomeId]);

  const rooms = allRooms.filter((r) => r.homeId === selectedHomeId);

  const handleEnter = () => {
    let url = `https://${window.location.hostname}:8081/`;
    if (selectedHomeId && selectedRoomId) {
      url += `?homeId=${selectedHomeId}&roomId=${selectedRoomId}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:ring-2 hover:ring-purple-400 hover:ring-offset-2 hover:ring-offset-background">
          <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <Box className="relative z-10 size-4 transition-transform duration-500 group-hover:rotate-180" />
          <span className="relative z-10 transition-all duration-300 group-hover:tracking-wider">
            3D World
          </span>
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enter 3D World</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {hasNoHome
              ? "You need to create a home first before you can enter the 3D world."
              : "Select a home and room to enter the 3D scene creator with the room's devices and furniture."}
          </p>
        </DialogHeader>
        
        {!hasNoHome ? (
          <>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="home" className="text-right">
                  Home
                </Label>
                <div className="col-span-3">
                  <Select
                    value={selectedHomeId}
                    onValueChange={setSelectedHomeId}
                    disabled={isLoadingHomes}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Home" />
                    </SelectTrigger>
                    <SelectContent>
                      {homes.map((home) => (
                        <SelectItem key={home.id} value={home.id}>
                          {home.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="room" className="text-right">
                  Room
                </Label>
                <div className="col-span-3">
                  <Select
                    value={selectedRoomId}
                    onValueChange={setSelectedRoomId}
                    disabled={!selectedHomeId || rooms.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map((room: { id: string; name: string }) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleEnter}
                disabled={!selectedHomeId || !selectedRoomId}
              >
                Enter
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
