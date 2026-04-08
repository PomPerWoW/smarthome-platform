import { getApiClient } from "../api/BackendApiClient";
import {
  normalizeAvatarBehaviorScript,
  type AvatarBehaviorAction,
} from "./avatarBehaviorScript";

async function resolveScriptRaw(
  scriptData: unknown,
  scriptFileUrl: string | null,
): Promise<unknown | null> {
  if (scriptData != null && scriptData !== "") {
    if (Array.isArray(scriptData)) return scriptData;
    if (
      typeof scriptData === "object" &&
      scriptData !== null &&
      "actions" in scriptData
    ) {
      return scriptData;
    }
  }
  if (scriptFileUrl) {
    try {
      const res = await fetch(scriptFileUrl, { credentials: "include" });
      if (!res.ok) {
        console.warn(
          `[AvatarScript] script_file_url returned ${res.status}: ${scriptFileUrl}`,
        );
        return null;
      }
      return await res.json();
    } catch (e) {
      console.warn("[AvatarScript] script_file_url fetch failed:", e);
      return null;
    }
  }
  return null;
}

export interface ApplyRoomAvatarScriptsDeps {
  setNpcScript: (npcId: string, actions: AvatarBehaviorAction[] | null) => void;
  setRobotScript: (actions: AvatarBehaviorAction[] | null) => void;
}

const NPC_IDS = new Set(["npc1", "npc3"]);

/**
 * Fetches `/api/homes/avatar-scripts/?room=…` (same source as the web app upload)
 * and drives NPC / robot behavior scripts in the scene.
 */
export async function loadAndApplyRoomAvatarScripts(
  roomId: string,
  deps: ApplyRoomAvatarScriptsDeps,
): Promise<void> {
  try {
    const rows = await getApiClient().getRoomAvatarScripts(roomId);
    let npcCount = 0;
    let robotLoaded = false;

    for (const row of rows) {
      const raw = await resolveScriptRaw(row.script_data, row.script_file_url);
      const actions = normalizeAvatarBehaviorScript(raw);

      if (row.avatar_type === "npc" && NPC_IDS.has(row.avatar_id)) {
        deps.setNpcScript(row.avatar_id, actions?.length ? actions : null);
        if (actions?.length) npcCount++;
        continue;
      }

      if (row.avatar_type === "robot" && row.avatar_id === "robot1") {
        deps.setRobotScript(actions?.length ? actions : null);
        robotLoaded = !!actions?.length;
      }
    }

    console.log(
      `[AvatarScript] Room ${roomId}: applied ${npcCount} NPC script(s), robot script ${robotLoaded ? "on" : "unchanged / patrol"}`,
    );
  } catch (e) {
    console.warn("[AvatarScript] Could not load room avatar scripts:", e);
  }
}
