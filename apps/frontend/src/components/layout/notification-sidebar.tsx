import { useState, useEffect } from "react";
import { useUIStore } from "@/stores/ui_store";
import {
  useNotificationStore,
  type AppNotification,
  type NotificationCategory,
  type NotificationIconType,
} from "@/stores/notification_store";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bell,
  Power,
  Sun,
  Palette,
  Wind,
  RotateCw,
  Thermometer,
  Volume2,
  VolumeX,
  Hash,
  Bot,
  Mic,
  MicOff,
  Wifi,
  WifiOff,
  Zap,
  AlertCircle,
  Lightbulb,
  Fan,
  Snowflake,
  Tv,
  CheckCheck,
  Trash2,
  X,
  Info,
  RefreshCw,
  BellOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);

  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(ts: number, ref: Date): boolean {
  const d = new Date(ts);
  return (
    d.getDate() === ref.getDate() &&
    d.getMonth() === ref.getMonth() &&
    d.getFullYear() === ref.getFullYear()
  );
}

interface Grouped {
  today: AppNotification[];
  yesterday: AppNotification[];
  older: AppNotification[];
}

function groupByDay(items: AppNotification[]): Grouped {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const today: AppNotification[] = [];
  const yest: AppNotification[] = [];
  const older: AppNotification[] = [];

  for (const n of items) {
    if (isSameDay(n.timestamp, now)) today.push(n);
    else if (isSameDay(n.timestamp, yesterday)) yest.push(n);
    else older.push(n);
  }

  return { today, yesterday: yest, older };
}

// ─── Icon + color mapping ─────────────────────────────────────────────────────

interface IconConfig {
  Icon: LucideIcon;
  bg: string;
  fg: string;
}

function resolveIcon(
  iconType: NotificationIconType,
  deviceType?: string,
): IconConfig {
  // ── Power on (device-type-aware) ───────────────────────────────────────────
  if (iconType === "power_on") {
    if (deviceType === "Lightbulb")
      return { Icon: Lightbulb, bg: "bg-yellow-500/20", fg: "text-yellow-400" };
    if (deviceType === "Fan")
      return { Icon: Fan, bg: "bg-cyan-500/20", fg: "text-cyan-400" };
    if (deviceType === "AirConditioner")
      return { Icon: Snowflake, bg: "bg-sky-500/20", fg: "text-sky-400" };
    if (deviceType === "Television")
      return { Icon: Tv, bg: "bg-blue-500/20", fg: "text-blue-400" };
    return { Icon: Power, bg: "bg-green-500/20", fg: "text-green-400" };
  }

  // ── Power off (device-type-aware) ──────────────────────────────────────────
  if (iconType === "power_off") {
    if (deviceType === "Lightbulb")
      return { Icon: Lightbulb, bg: "bg-slate-500/20", fg: "text-slate-400" };
    if (deviceType === "Fan")
      return { Icon: Fan, bg: "bg-slate-500/20", fg: "text-slate-400" };
    if (deviceType === "AirConditioner")
      return { Icon: Snowflake, bg: "bg-slate-500/20", fg: "text-slate-400" };
    if (deviceType === "Television")
      return { Icon: Tv, bg: "bg-slate-500/20", fg: "text-slate-400" };
    return { Icon: Power, bg: "bg-red-500/20", fg: "text-red-400" };
  }

  // ── Lightbulb ──────────────────────────────────────────────────────────────
  if (iconType === "brightness")
    return { Icon: Sun, bg: "bg-amber-500/20", fg: "text-amber-400" };
  if (iconType === "color")
    return { Icon: Palette, bg: "bg-purple-500/20", fg: "text-purple-400" };

  // ── Fan ───────────────────────────────────────────────────────────────────
  if (iconType === "fan_speed")
    return { Icon: Wind, bg: "bg-cyan-500/20", fg: "text-cyan-400" };
  if (iconType === "fan_swing_on" || iconType === "fan_swing_off")
    return { Icon: RotateCw, bg: "bg-cyan-500/20", fg: "text-cyan-400" };

  // ── Air conditioner ───────────────────────────────────────────────────────
  if (iconType === "temperature")
    return { Icon: Thermometer, bg: "bg-sky-500/20", fg: "text-sky-400" };

  // ── Television ───────────────────────────────────────────────────────────
  if (iconType === "volume")
    return { Icon: Volume2, bg: "bg-blue-500/20", fg: "text-blue-400" };
  if (iconType === "mute")
    return { Icon: VolumeX, bg: "bg-orange-500/20", fg: "text-orange-400" };
  if (iconType === "unmute")
    return { Icon: Volume2, bg: "bg-blue-500/20", fg: "text-blue-400" };
  if (iconType === "channel")
    return { Icon: Hash, bg: "bg-blue-500/20", fg: "text-blue-400" };

  // ── Robot / voice ─────────────────────────────────────────────────────────
  if (iconType === "robot_command_success")
    return { Icon: Bot, bg: "bg-green-500/20", fg: "text-green-400" };
  if (iconType === "robot_command_fail")
    return { Icon: Bot, bg: "bg-red-500/20", fg: "text-red-400" };
  if (iconType === "robot_listening")
    return { Icon: Mic, bg: "bg-violet-500/20", fg: "text-violet-400" };
  if (iconType === "robot_cancelled")
    return { Icon: MicOff, bg: "bg-slate-500/20", fg: "text-slate-400" };
  if (iconType === "robot_info")
    return { Icon: Bot, bg: "bg-indigo-500/20", fg: "text-indigo-400" };

  // ── Automation ────────────────────────────────────────────────────────────
  if (iconType === "automation")
    return { Icon: Zap, bg: "bg-yellow-500/20", fg: "text-yellow-400" };

  // ── System ────────────────────────────────────────────────────────────────
  if (iconType === "system_connected")
    return { Icon: Wifi, bg: "bg-emerald-500/20", fg: "text-emerald-400" };
  if (iconType === "system_disconnected")
    return { Icon: WifiOff, bg: "bg-red-500/20", fg: "text-red-400" };
  if (iconType === "device_update")
    return { Icon: RefreshCw, bg: "bg-indigo-500/20", fg: "text-indigo-400" };

  // ── Generic ───────────────────────────────────────────────────────────────
  if (iconType === "error")
    return { Icon: AlertCircle, bg: "bg-red-500/20", fg: "text-red-400" };

  return { Icon: Info, bg: "bg-muted/60", fg: "text-muted-foreground" };
}

// ─── Severity border accent ───────────────────────────────────────────────────

function severityAccent(severity: AppNotification["severity"]): string {
  switch (severity) {
    case "success":
      return "border-l-green-500";
    case "warning":
      return "border-l-yellow-500";
    case "error":
      return "border-l-red-500";
    default:
      return "border-l-transparent";
  }
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationItem({ n }: { n: AppNotification }) {
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const [hovered, setHovered] = useState(false);

  const { Icon, bg, fg } = resolveIcon(n.iconType, n.deviceType);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !n.read && markAsRead(n.id)}
      onKeyDown={(e) => e.key === "Enter" && !n.read && markAsRead(n.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex items-start gap-3 px-4 py-3 border-l-2 transition-colors cursor-pointer select-none",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40",
        !n.read ? "bg-primary/[0.04]" : "bg-transparent",
        severityAccent(n.severity),
      )}
    >
      {/* Unread dot */}
      {!n.read && (
        <span className="absolute left-[5px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
      )}

      {/* Device / action icon */}
      <div
        className={cn(
          "relative shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
          bg,
        )}
      >
        <Icon className={cn("w-[18px] h-[18px]", fg)} />

        {/* Color swatch for light color changes */}
        {n.iconType === "color" && n.colorValue && (
          <span
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background shadow"
            style={{ backgroundColor: n.colorValue }}
            title={n.colorValue}
          />
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[13px] leading-snug",
              !n.read
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/90",
            )}
          >
            {n.title}
          </p>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-px">
            {formatRelativeTime(n.timestamp)}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {n.description}
        </p>

        {/* Numeric badge (brightness %, temp, speed…) */}
        {n.numericValue !== undefined && n.unit && (
          <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
            {n.numericValue}
            {n.unit}
          </span>
        )}

        {/* Color hex badge */}
        {n.iconType === "color" && n.colorValue && (
          <span className="inline-flex items-center gap-1.5 mt-1.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
            <span
              className="w-2.5 h-2.5 rounded-sm border border-border"
              style={{ backgroundColor: n.colorValue }}
            />
            {n.colorValue.toUpperCase()}
          </span>
        )}
      </div>

      {/* Hover delete button */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeNotification(n.id);
          }}
          className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Day group ────────────────────────────────────────────────────────────────

function DayGroup({
  label,
  items,
}: {
  label: string;
  items: AppNotification[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="sticky top-0 z-10 px-4 py-1.5 bg-muted/60 backdrop-blur-sm border-y text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {items.map((n) => (
        <NotificationItem key={n.id} n={n} />
      ))}
    </div>
  );
}

// ─── Filter tab definitions ───────────────────────────────────────────────────

type FilterValue = NotificationCategory | "all";

interface FilterTab {
  label: string;
  value: FilterValue;
  Icon: LucideIcon;
}

const TABS: FilterTab[] = [
  { label: "All", value: "all", Icon: Bell },
  { label: "Devices", value: "device", Icon: Lightbulb },
  { label: "Robot", value: "robot", Icon: Bot },
  { label: "System", value: "system", Icon: Wifi },
];

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function NotificationSidebar() {
  const isOpen = useNotificationStore((s) => s.isOpen);
  const setOpen = useNotificationStore((s) => s.setOpen);
  const notifications = useNotificationStore((s) => s.notifications);
  const getByCategory = useNotificationStore((s) => s.getByCategory);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  const setModalOpen = useUIStore((s) => s.set_modal_open);

  useEffect(() => {
    setModalOpen(isOpen);
    return () => setModalOpen(false);
  }, [isOpen, setModalOpen]);

  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  const filtered = getByCategory(activeFilter);
  const { today, yesterday, older } = groupByDay(filtered);
  const unread = unreadCount();

  const countFor = (v: FilterValue) =>
    v === "all"
      ? notifications.length
      : notifications.filter((n) => n.category === v).length;

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[420px] sm:max-w-[420px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <SheetHeader className="px-4 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            {/* Title + unread badge */}
            <div className="flex items-center gap-2">
              <Bell className="w-[18px] h-[18px] text-foreground" />
              <SheetTitle className="text-[15px]">Notifications</SheetTitle>
              {unread > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>

            {/* Action buttons + close */}
            <div className="flex items-center gap-0.5">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={clearAll}
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <SheetClose
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1 cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>

          {/* Status line */}
          <p className="text-[11px] text-muted-foreground">
            {unread === 0
              ? "All caught up — no unread notifications"
              : `${unread} unread notification${unread !== 1 ? "s" : ""}`}
          </p>
        </SheetHeader>

        {/* ── Filter tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0 overflow-x-auto scrollbar-none">
          {TABS.map(({ label, value, Icon }) => {
            const count = countFor(value);
            const isActive = activeFilter === value;
            return (
              <button
                key={value}
                onClick={() => setActiveFilter(value)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
                {count > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold leading-none",
                      isActive
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Notification list ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <BellOff className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground/70">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {activeFilter === "all"
                  ? "Actions you take — device controls, voice commands, and system events — will appear here."
                  : `No ${activeFilter} notifications yet.`}
              </p>
            </div>
          ) : (
            <>
              <DayGroup label="Today" items={today} />
              <DayGroup label="Yesterday" items={yesterday} />
              <DayGroup label="Older" items={older} />
            </>
          )}
        </div>

        {/* ── Footer summary ─────────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-t bg-muted/30 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              {filtered.length} notification{filtered.length !== 1 ? "s" : ""}
            </span>
            {unread > 0 && (
              <span className="text-primary font-medium">{unread} unread</span>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Bell button (placed in the app header) ───────────────────────────────────

export function NotificationBellButton() {
  const toggleOpen = useNotificationStore((s) => s.toggleOpen);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const unread = unreadCount();

  return (
    <button
      onClick={toggleOpen}
      className={cn(
        "relative inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors",
        "text-foreground/80 hover:text-foreground hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      title="Notifications"
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
    >
      <Bell className="w-[18px] h-[18px]" />
      {unread > 0 && (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 inline-flex items-center justify-center",
            "min-w-[15px] h-[15px] px-0.5 rounded-full",
            "bg-red-500 text-white",
            "text-[9px] font-bold leading-none pointer-events-none",
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
