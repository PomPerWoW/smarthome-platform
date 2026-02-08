import type { RPMUserControlledAvatarSystem } from "../systems/RPMUserControlledAvatarSystem";

export function setupLipSyncControlPanel(
  rpmSystem: RPMUserControlledAvatarSystem
): (enabled: boolean) => void {
  const panel = document.createElement("div");
  panel.innerHTML = `
    <div id="lipsync-panel" style="
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      background: rgba(0,0,0,0.85); padding: 15px 20px; border-radius: 12px;
      color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; width: 260px; box-sizing: border-box; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    ">
      <h3 style="margin:0 0 12px 0; font-size:16px;">🎤 Lip Sync</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button id="lipsync-speak" style="padding:10px 16px; background:#4CAF50; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; text-align:left;">
          (1) Speak (hello_male.mp3)
        </button>
        <button id="lipsync-stop" style="padding:10px 16px; background:#f44336; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; text-align:left;">
          (2) Stop Speaking
        </button>
        <button id="lipsync-mic" style="padding:10px 16px; background:#555; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; text-align:left;">
          (3) Mic Mode (lip sync to voice)
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const testAudioUrl = "/audio/script/hello_male.mp3";
  const speakBtn = document.getElementById("lipsync-speak") as HTMLButtonElement;
  const stopBtn = document.getElementById("lipsync-stop") as HTMLButtonElement;
  const micButton = document.getElementById("lipsync-mic") as HTMLButtonElement;

  const updateMicButtonStyle = () => {
    if (!micButton) return;
    micButton.style.background = rpmSystem.isMicrophoneMode() ? "#2196F3" : "#555";
  };

  const setEnabled = (enabled: boolean): void => {
    [speakBtn, stopBtn, micButton].forEach((btn) => {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? "1" : "0.5";
      btn.style.cursor = enabled ? "pointer" : "not-allowed";
    });
    if (enabled) updateMicButtonStyle();
  };

  setEnabled(false);

  document.getElementById("lipsync-speak")?.addEventListener("click", () => {
    if (speakBtn?.disabled) return;
    rpmSystem.speak(testAudioUrl);
  });

  const toggleMicMode = async () => {
    if (micButton?.disabled) return;
    await rpmSystem.setMicrophoneMode(!rpmSystem.isMicrophoneMode());
    updateMicButtonStyle();
  };

  document.getElementById("lipsync-stop")?.addEventListener("click", () => {
    if (stopBtn?.disabled) return;
    if (rpmSystem.stopSpeaking()) updateMicButtonStyle();
  });

  micButton?.addEventListener("click", toggleMicMode);

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (speakBtn?.disabled) return;
    if (e.key === "1") rpmSystem.speak(testAudioUrl);
    if (e.key === "2") {
      if (rpmSystem.stopSpeaking()) updateMicButtonStyle();
    }
    if (e.key === "3") toggleMicMode();
  });

  console.log("✅ Lip sync control panel ready");
  return setEnabled;
}
