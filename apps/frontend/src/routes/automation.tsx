import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MoreVertical,
  Calendar,
  Clock,
  Sun,
  Sunset,
  Trash2,
  Pencil,
  Thermometer,
  Wind,
  Tv,
  Lightbulb,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

import { AutomationService } from "@/services/AutomationService";
import { DeviceService } from "@/services/DeviceService";
import {
  type Automation,
  DayOfWeek,
  SolarEvent,
  type CreateAutomationDTO,
  type UpdateAutomationDTO,
} from "@/types/automation.types";
import { DeviceType } from "@/types/device.types";

export const Route = createFileRoute("/automation")({
  component: AutomationPage,
});

const automationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  device: z.string().min(1, "Device is required"),
  is_active: z.boolean().default(true),
  sunrise_sunset: z.boolean().default(false),
  time: z.string().nullable().optional(),
  solar_event: z.nativeEnum(SolarEvent).nullable().optional(),
  repeat_days: z.array(z.nativeEnum(DayOfWeek)).default([]),
  action: z.object({
    is_on: z.boolean().optional(),
    brightness: z.number().min(0).max(100).optional(),
    color: z.string().optional(),
    temperature: z.number().optional(),
    speed: z.number().optional(),
    swing: z.boolean().optional(),
    volume: z.number().optional(),
    channel: z.number().optional(),
  }),
});

type AutomationFormValues = z.infer<typeof automationSchema>;

function AutomationPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null,
  );
  const [deletingAutomation, setDeletingAutomation] =
    useState<Automation | null>(null);

  const queryClient = useQueryClient();

  // Fetch Automations
  const {
    data: automations = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["automations"],
    queryFn: () => AutomationService.getInstance().getAllAutomations(),
  });

  // Fetch Devices for the form
  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: () => DeviceService.getInstance().getAllDevices(),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAutomationDTO) =>
      AutomationService.getInstance().createAutomation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automation created");
      setIsSheetOpen(false);
      setEditingAutomation(null);
    },
    onError: () => toast.error("Failed to create automation"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAutomationDTO }) =>
      AutomationService.getInstance().updateAutomation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automation updated");
      setIsSheetOpen(false);
      setEditingAutomation(null);
    },
    onError: () => toast.error("Failed to update automation"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      AutomationService.getInstance().deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automation deleted");
      setDeletingAutomation(null);
    },
    onError: () => toast.error("Failed to delete automation"),
  });

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setIsSheetOpen(true);
  };

  const handleDelete = (automation: Automation) => {
    setDeletingAutomation(automation);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setIsSheetOpen(true);
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading automations...</div>;
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load automations
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-muted-foreground">
            Manage your smart home automations
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Automation
        </Button>
      </div>

      <div className="h-[calc(100vh-140px)] overflow-y-auto pb-6 pr-2">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onEdit={handleEdit}
              onDelete={handleDelete}
              devices={devices}
            />
          ))}
          {automations.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              No automations found. Create one to get started.
            </div>
          )}
        </div>
      </div>

      <AutomationSheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingAutomation(null);
        }}
        automation={editingAutomation}
        devices={devices}
        onSubmit={(values) => {
          if (editingAutomation) {
            // For updates, the backend requires device and title
            const submissionData: UpdateAutomationDTO = {
              device: values.device,
              title: values.title,
            };

            // Manual Diffing
            if (values.is_active !== editingAutomation.is_active) {
              submissionData.is_active = values.is_active;
            }

            // For arrays like repeat_days, we can compare stringified sorted versions
            const currentDays = [...values.repeat_days].sort();
            const originalDays = [...editingAutomation.repeat_days].sort();
            if (JSON.stringify(currentDays) !== JSON.stringify(originalDays)) {
              submissionData.repeat_days = values.repeat_days;
            }

            // Handle Sunrise/Sunset logic
            // We need to compare the LOGIC state, not just raw values
            // Logic: Is it sunrise/sunset? If yes, check solar_event. If no, check time.
            if (values.sunrise_sunset !== editingAutomation.sunrise_sunset) {
              // Mode changed, send everything
              submissionData.sunrise_sunset = values.sunrise_sunset;
              if (values.sunrise_sunset) {
                submissionData.solar_event = values.solar_event;
                submissionData.time = null;
              } else {
                submissionData.time = values.time;
                submissionData.solar_event = null;
              }
            } else {
              // Mode same, check specific fields
              if (values.sunrise_sunset) {
                if (values.solar_event !== editingAutomation.solar_event) {
                  submissionData.solar_event = values.solar_event;
                }
              } else {
                if (values.time !== editingAutomation.time) {
                  submissionData.time = values.time;
                }
              }
            }

            // Handle Action fields
            // We compare specific known keys for the current device type or just check all keys in values.action
            // Since values.action is from the form, it defaults populated.
            // We should check if any meaningful value is different from editingAutomation.action
            const currentAction = values.action;
            const originalAction = editingAutomation.action;

            let actionChanged = false;
            // Check common fields
            if (currentAction.is_on !== originalAction.is_on) actionChanged = true;
            if (currentAction.brightness !== originalAction.brightness) actionChanged = true;
            if (currentAction.color !== originalAction.color) actionChanged = true;
            if (currentAction.temperature !== originalAction.temperature) actionChanged = true;
            if (currentAction.speed !== originalAction.speed) actionChanged = true;
            if (currentAction.swing !== originalAction.swing) actionChanged = true;
            if (currentAction.volume !== originalAction.volume) actionChanged = true;
            if (currentAction.channel !== originalAction.channel) actionChanged = true;

            if (actionChanged) {
              submissionData.action = values.action;
            }

            updateMutation.mutate({
              id: editingAutomation.id,
              data: submissionData,
            });
          } else {
            // For creation, send full data
            const submissionData: CreateAutomationDTO = {
              ...values,
              time: values.sunrise_sunset ? null : values.time,
              solar_event: values.sunrise_sunset ? values.solar_event : null,
            };
            createMutation.mutate(submissionData, {
              onSuccess: () => {
                // The form state will be reset when reopened because
                // handleCreate sets editingAutomation to null and the sheet re-renders.
                // Re-rendering happens when editingAutomation becomes null.
                // However, react-hook-form cache might preserve values if not explicitly reset.
              }
            });
          }
        }}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog
        open={!!deletingAutomation}
        onOpenChange={(open) => !open && setDeletingAutomation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              automation "{deletingAutomation?.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() =>
                deletingAutomation &&
                deleteMutation.mutate(deletingAutomation.id)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AutomationCard({
  automation,
  onEdit,
  onDelete,
  devices,
}: {
  automation: Automation;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
  devices: any[];
}) {
  const targetDevice = devices.find((d) => d.id === automation.device);
  const deviceType = targetDevice?.type;

  // Format repeat days
  const repeatText =
    automation.repeat_days.length === 7
      ? "Every day"
      : automation.repeat_days.length === 0
        ? "Once"
        : automation.repeat_days
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3))
          .join(", ");

  const getActionSummary = () => {
    const parts = [];
    const action = automation.action;

    if (action.is_on === true) parts.push("Turn On");
    else if (action.is_on === false) parts.push("Turn Off");

    if (deviceType === DeviceType.Lightbulb) {
      if (action.brightness) parts.push(`Brightness: ${action.brightness}%`);
      if (action.color)
        parts.push(
          <div
            className="w-4 h-4 rounded-full border border-gray-200 inline-block ml-1 align-middle"
            style={{ backgroundColor: action.color }}
            title={action.color}
          />,
        );
    } else if (deviceType === DeviceType.AirConditioner) {
      if (action.temperature) parts.push(`Temp: ${action.temperature}°C`);
    } else if (deviceType === DeviceType.Fan) {
      if (action.speed) parts.push(`Speed: ${action.speed}`);
      if (action.swing !== undefined) parts.push(`Swing: ${action.swing ? 'On' : 'Off'}`);
    } else if (deviceType === DeviceType.Television) {
      if (action.volume) parts.push(`Vol: ${action.volume}`);
      if (action.channel) parts.push(`Ch: ${action.channel}`);
    }

    return (
      <span className="flex items-center gap-2">
        {parts.map((part, i) => (
          <span key={i} className="text-muted-foreground font-normal">
            {i > 0 && " • "}
            {part}
          </span>
        ))}
      </span>
    );
  };

  const getIcon = () => {
    switch (deviceType) {
      case DeviceType.Lightbulb: return <Lightbulb className="mr-2 h-4 w-4" />;
      case DeviceType.AirConditioner: return <Thermometer className="mr-2 h-4 w-4" />;
      case DeviceType.Fan: return <Wind className="mr-2 h-4 w-4" />;
      case DeviceType.Television: return <Tv className="mr-2 h-4 w-4" />;
      default: return <MoreVertical className="mr-2 h-4 w-4" />;
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center">
          {getIcon()}
          {automation.title}
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(automation)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => onDelete(automation)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center text-sm text-muted-foreground">
            {automation.sunrise_sunset ? (
              automation.solar_event === SolarEvent.Sunrise ? (
                <Sun className="mr-2 h-4 w-4 text-orange-500" />
              ) : (
                <Sunset className="mr-2 h-4 w-4 text-indigo-500" />
              )
            ) : (
              <Clock className="mr-2 h-4 w-4" />
            )}
            {automation.sunrise_sunset
              ? automation.solar_event === SolarEvent.Sunrise
                ? "At Sunrise"
                : "At Sunset"
              : automation.time}
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="mr-2 h-4 w-4" />
            {repeatText}
          </div>
          <div className="text-sm font-medium">
            {targetDevice?.name || "Unknown Device"}
            <div className="mt-1">{getActionSummary()}</div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${automation.is_active ? "bg-green-500" : "bg-gray-300"}`}
          />
          <span className="text-xs text-muted-foreground">
            {automation.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

function AutomationSheet({
  open,
  onOpenChange,
  automation,
  devices,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation: Automation | null;
  devices: any[];
  onSubmit: (values: AutomationFormValues) => void;
  isPending: boolean;
}) {
  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationSchema) as any,
    defaultValues: {
      title: "",
      device: "",
      is_active: true,
      sunrise_sunset: false,
      time: "12:00:00",
      repeat_days: [],
      action: { is_on: true, brightness: 100 },
      solar_event: SolarEvent.Sunrise,
    },
    values: automation
      ? {
        title: automation.title,
        device: automation.device,
        is_active: automation.is_active,
        sunrise_sunset: automation.sunrise_sunset,
        repeat_days: automation.repeat_days,
        time: automation.time || "12:00:00",
        action: automation.action || { is_on: true, brightness: 100 },
        solar_event: automation.solar_event || SolarEvent.Sunrise,
      }
      : undefined,
  });

  // Reset form when sheet is fully closed or opened for creation
  // `automation` prop going to null signals creation
  // We use key inside the Sheet content wrapper below instead of useEffect

  const { watch, setValue } = form;
  const isSunriseSunset = watch("sunrise_sunset");
  const repeatDays = watch("repeat_days");
  const selectedDeviceId = watch("device");
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  const toggleDay = (day: DayOfWeek) => {
    const current = repeatDays || [];
    if (current.includes(day)) {
      setValue(
        "repeat_days",
        current.filter((d) => d !== day),
      );
    } else {
      setValue("repeat_days", [...current, day]);
    }
  };

  const days = Object.values(DayOfWeek);

  const clearActionValue = (field: keyof AutomationFormValues["action"]) => {
    setValue(`action.${field}` as any, undefined);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {automation ? "Edit Automation" : "Create Automation"}
          </SheetTitle>
          <SheetDescription>
            Configure your automation settings below
          </SheetDescription>
        </SheetHeader>

        {/* Use a key prop to force re-render/reset form on create */}
        <form
          key={automation ? automation.id : "new"}
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 py-6"
        >
          <div className="space-y-2">
            <Label>Title</Label>
            <Input {...form.register("title")} placeholder="My Scene" />
            {form.formState.errors.title && (
              <p className="text-xs text-red-500">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Device</Label>
            <Select
              onValueChange={(val) => setValue("device", val)}
              value={watch("device")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name} ({device.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.device && (
              <p className="text-xs text-red-500">
                {form.formState.errors.device.message}
              </p>
            )}
          </div>

          <div className="space-y-4 border p-4 rounded-md">
            <div className="flex items-center justify-between">
              <Label>Trigger</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Time</span>
                <Switch
                  checked={isSunriseSunset}
                  onCheckedChange={(checked) =>
                    setValue("sunrise_sunset", checked)
                  }
                />
                <span className="text-xs text-muted-foreground">Sun Event</span>
              </div>
            </div>

            {isSunriseSunset ? (
              <div className="space-y-2">
                <Label>Event</Label>
                <Select
                  onValueChange={(val) =>
                    setValue("solar_event", val as SolarEvent)
                  }
                  value={watch("solar_event") || undefined}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select event" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SolarEvent.Sunrise}>Sunrise</SelectItem>
                    <SelectItem value={SolarEvent.Sunset}>Sunset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" step="1" {...form.register("time")} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Repeat Days</Label>
              <div className="flex flex-wrap gap-1">
                {days.map((day) => (
                  <Button
                    key={day}
                    type="button"
                    variant={repeatDays?.includes(day) ? "default" : "outline"}
                    size="sm"
                    className="w-10 h-10 p-0"
                    onClick={() => toggleDay(day)}
                  >
                    {day.charAt(0).toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 border p-4 rounded-md">
            <Label>Action</Label>

            <div className="flex items-center justify-between">
              <Label className="font-normal">Turn the device</Label>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${watch("action.is_on") === false ? "font-bold" : "text-muted-foreground"}`}
                >
                  OFF
                </span>
                <Switch
                  checked={watch("action.is_on") !== false}
                  onCheckedChange={(checked) =>
                    setValue("action.is_on", checked)
                  }
                />
                <span
                  className={`text-sm ${watch("action.is_on") !== false ? "font-bold" : "text-muted-foreground"}`}
                >
                  ON
                </span>
              </div>
            </div>

            {/* Lightbulb Controls */}
            {selectedDevice?.type === DeviceType.Lightbulb && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Brightness</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.brightness") !== undefined ? `${watch("action.brightness")}%` : "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("brightness")}
                        title="Clear brightness"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    value={[watch("action.brightness") ?? 100]}
                    max={100}
                    step={1}
                    onValueChange={([val]) => setValue("action.brightness", val)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Color</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.color") || "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("color")}
                        title="Clear color"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    type="color"
                    value={watch("action.color") || "#ffffff"}
                    onChange={(e) => setValue("action.color", e.target.value)}
                    className="h-10 w-full"
                  />
                </div>
              </div>
            )}

            {/* AC Controls */}
            {selectedDevice?.type === DeviceType.AirConditioner && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Temperature (°C)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.temperature") !== undefined ? watch("action.temperature") : "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("temperature")}
                        title="Clear temperature"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="0.5"
                    min="16"
                    max="30"
                    value={watch("action.temperature") ?? ""}
                    onChange={(e) => setValue("action.temperature", parseFloat(e.target.value))}
                  />
                </div>
              </div>
            )}

            {/* Fan Controls */}
            {selectedDevice?.type === DeviceType.Fan && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Speed (1-5)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.speed") !== undefined ? watch("action.speed") : "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("speed")}
                        title="Clear speed"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    value={[watch("action.speed") ?? 1]}
                    min={1}
                    max={5}
                    step={1}
                    onValueChange={([val]) => setValue("action.speed", val)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Swing</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground mr-2">
                      {watch("action.swing") !== undefined ? (watch("action.swing") ? "On" : "Off") : "Not set"}
                    </span>
                    <Switch
                      checked={!!watch("action.swing")}
                      onCheckedChange={(val) => setValue("action.swing", val)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => clearActionValue("swing")}
                      title="Clear swing"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* TV Controls */}
            {selectedDevice?.type === DeviceType.Television && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Volume</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.volume") !== undefined ? watch("action.volume") : "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("volume")}
                        title="Clear volume"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Slider
                    value={[watch("action.volume") ?? 10]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([val]) => setValue("action.volume", val)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Channel</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {watch("action.channel") !== undefined ? watch("action.channel") : "Not set"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => clearActionValue("channel")}
                        title="Clear channel"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={watch("action.channel") ?? ""}
                    onChange={(e) => setValue("action.channel", parseInt(e.target.value))}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="flex items-center justify-between border p-4 rounded-md">
            <Label>Automation Active</Label>
            <Switch
              checked={watch("is_active")}
              onCheckedChange={(checked) => setValue("is_active", checked)}
            />
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : automation ? "Save Changes" : "Create"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
