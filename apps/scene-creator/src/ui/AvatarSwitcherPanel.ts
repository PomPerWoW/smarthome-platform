export type ControllableAvatarSystem = {
  setCamera: (cam: any) => void;
  setActive: (active: boolean) => void;
  switchToAvatar: (avatarId: string) => void;
};

export interface AvatarEntry {
  system: ControllableAvatarSystem;
  avatarId: string;
  avatarName: string;
}

const entries: AvatarEntry[] = [];
let currentIndex = 0;
let camera: any = null;
let panelContainer: HTMLDivElement | null = null;
let panelContent: HTMLDivElement | null = null;
let onAvatarSwitch: ((entry: AvatarEntry | null) => void) | null = null;

// Register an avatar
export function registerAvatar(
  system: ControllableAvatarSystem,
  avatarId: string,
  avatarName: string
): void {
  entries.push({ system, avatarId, avatarName });
}

// Set the camera reference (required before setupAvatarSwitcherPanel)
export function setAvatarSwitcherCamera(cam: any): void {
  camera = cam;
}

// Get current number of registered avatars
export function getAvatarCount(): number {
  return entries.length;
}

// Get the current active entry (for UI highlight)
export function getCurrentEntry(): AvatarEntry | null {
  if (entries.length === 0) return null;
  return entries[currentIndex] ?? null;
}

// Set callback invoked when the active avatar changes (e.g. to enable/disable lip sync panel when RPM avatar is selected)
export function setOnAvatarSwitch(cb: (entry: AvatarEntry | null) => void): void {
  onAvatarSwitch = cb;
  cb(entries.length > 0 ? (entries[currentIndex] ?? null) : null);
}

// Switch to the next avatar (O key). Loops to start after last.
function switchToNext(): void {
  if (entries.length === 0) return;
  if (entries.length === 1) return;

  const prev = entries[currentIndex];
  if (prev) prev.system.setActive(false);

  currentIndex = (currentIndex + 1) % entries.length;
  const next = entries[currentIndex];
  if (!next || !camera) return;

  next.system.setActive(true);
  next.system.setCamera(camera);
  next.system.switchToAvatar(next.avatarId);

  updatePanelHighlight();
  onAvatarSwitch?.(next);
}

function updatePanelHighlight(): void {
  if (!panelContent) return;
  const boxes = panelContent.querySelectorAll("[data-avatar-index]");
  boxes.forEach((el, i) => {
    const box = el as HTMLElement;
    box.style.background = i === currentIndex ? "rgba(33, 150, 243, 0.4)" : "rgba(255,255,255,0.08)";
    box.style.borderColor = i === currentIndex ? "#2196F3" : "transparent";
  });
}

// Create the avatar switcher panel and O key listener (visible only if count >= 2)
export function setupAvatarSwitcherPanel(): void {
  if (entries.length < 2) return;

  // First registered = first to control
  currentIndex = 0;

  // Set initial active: only the "first to control" (first registered) is active
  entries.forEach((e, i) => {
    e.system.setActive(i === currentIndex);
  });
  const active = entries[currentIndex];
  if (active && camera) {
    active.system.setCamera(camera);
    active.system.switchToAvatar(active.avatarId);
  }

  panelContainer = document.createElement("div");
  panelContent = document.createElement("div");
  panelContent.style.display = "flex";
  panelContent.style.flexDirection = "column";
  panelContent.style.gap = "8px";

  entries.forEach((e, i) => {
    const box = document.createElement("div");
    box.setAttribute("data-avatar-index", String(i));
    box.textContent = `${i + 1}. ${e.avatarName}`;
    box.style.padding = "10px 16px";
    box.style.borderRadius = "8px";
    box.style.border = "2px solid transparent";
    box.style.cursor = "default";
    box.style.fontSize = "14px";
    box.style.boxSizing = "border-box";
    box.style.color = "white";
    if (i === currentIndex) {
      box.style.background = "rgba(33, 150, 243, 0.4)";
      box.style.borderColor = "#2196F3";
    } else {
      box.style.background = "rgba(255,255,255,0.08)";
    }
    panelContent!.appendChild(box);
  });

  const inner = document.createElement("div");
  inner.id = "avatar-switcher-panel";
  inner.style.position = "fixed";
  inner.style.top = "240px";
  inner.style.right = "20px";
  inner.style.zIndex = "9998";
  inner.style.background = "rgba(0,0,0,0.85)";
  inner.style.padding = "15px 20px";
  inner.style.borderRadius = "12px";
  inner.style.color = "white";
  inner.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  inner.style.width = "260px";
  inner.style.boxSizing = "border-box";
  inner.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";

  const title = document.createElement("h3");
  title.style.margin = "0 0 12px 0";
  title.style.fontSize = "16px";
  title.textContent = "🎮 Avatars (O = switch)";
  inner.appendChild(title);
  inner.appendChild(panelContent);

  panelContainer.appendChild(inner);
  document.body.appendChild(panelContainer);

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "o") {
      e.preventDefault();
      switchToNext();
    }
  });

  onAvatarSwitch?.(entries[currentIndex] ?? null);

  console.log(`✅ Avatar switcher: ${entries.length} avatars, press O to switch`);
}
