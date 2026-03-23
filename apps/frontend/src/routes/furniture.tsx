import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Armchair, Pencil, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState, ErrorState } from "@/components/devices";
import { HomeService } from "@/services/HomeService";
import type { FurnitureItem } from "@/models/Room";
import { useUIStore } from "@/stores/ui_store";

export const Route = createFileRoute("/furniture")({
  component: FurniturePage,
});

function FurniturePage() {
  const setModalOpen = useUIStore((s) => s.set_modal_open);
  const [search, setSearch] = useState("");
  const [furnitureToRename, setFurnitureToRename] =
    useState<FurnitureItem | null>(null);
  const [furnitureToDelete, setFurnitureToDelete] =
    useState<FurnitureItem | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const open = !!furnitureToRename || !!furnitureToDelete;
    setModalOpen(open);
    return () => setModalOpen(false);
  }, [furnitureToRename, furnitureToDelete, setModalOpen]);

  const {
    data: furniture = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["all-furniture"],
    queryFn: () => HomeService.getInstance().getAllFurniture(),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      HomeService.getInstance().renameFurniture(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-furniture"] });
      queryClient.invalidateQueries({ queryKey: ["home-furniture"] });
      setFurnitureToRename(null);
      toast.success("Furniture renamed successfully");
    },
    onError: (error) => {
      toast.error(`Failed to rename furniture: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      HomeService.getInstance().deleteFurniture(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-furniture"] });
      queryClient.invalidateQueries({ queryKey: ["home-furniture"] });
      setFurnitureToDelete(null);
      toast.success("Furniture deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete furniture: ${error.message}`);
    },
  });

  // Filter furniture by search
  const filteredFurniture = furniture.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.type.toLowerCase().includes(search.toLowerCase()) ||
    (item.roomName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // Group by type for stats
  const furnitureByType = furniture.reduce(
    (acc, f) => {
      const type = f.type || "Unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

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
          <h1 className="text-2xl font-bold">Furniture</h1>
        </div>
        <ErrorState
          title="Failed to load furniture"
          message="We couldn't fetch your furniture. Please try again."
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
            <h1 className="text-2xl font-bold">Furniture</h1>
            <p className="text-muted-foreground text-sm">
              {furniture.length} furniture across all homes
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search furniture..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </div>

      {/* Stats cards */}
      {!isLoading && Object.keys(furnitureByType).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(furnitureByType).map(([type, count]) => (
            <div
              key={type}
              className="rounded-lg border bg-card p-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-md bg-orange-500/10 flex items-center justify-center">
                <Armchair className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-lg font-semibold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {type.replace(/_/g, " ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && furniture.length === 0 && (
        <EmptyState
          icon={<Armchair className="h-8 w-8 text-muted-foreground" />}
          title="No furniture yet"
          description="Place furniture in the 3D World to see them here."
          action={
            <Button asChild>
              <Link to="/">Go to Dashboard</Link>
            </Button>
          }
        />
      )}

      {/* No results */}
      {!isLoading && furniture.length > 0 && filteredFurniture.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No furniture matches your search.
        </div>
      )}

      {/* Furniture grid */}
      {!isLoading && filteredFurniture.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                <h4 className="font-semibold text-sm truncate">{item.name}</h4>
                <p className="text-xs text-muted-foreground capitalize">
                  {item.type.replace(/_/g, " ")}
                </p>
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

      {/* Rename Furniture Dialog */}
      <RenameDialog
        open={!!furnitureToRename}
        onOpenChange={(open) => !open && setFurnitureToRename(null)}
        currentName={furnitureToRename?.name || ""}
        title="Rename Furniture"
        description="Enter a new name for this furniture."
        onSave={(newName) =>
          furnitureToRename &&
          renameMutation.mutate({ id: furnitureToRename.id, name: newName })
        }
        isPending={renameMutation.isPending}
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
              This will permanently delete &quot;{furnitureToDelete?.name}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                furnitureToDelete &&
                deleteMutation.mutate(furnitureToDelete.id)
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
