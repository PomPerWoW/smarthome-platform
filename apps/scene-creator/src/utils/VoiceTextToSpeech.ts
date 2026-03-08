const PREFERRED_VOICE_NAME = "Samantha";
const GREETING = "How can I help you?";
const GOODBYE = "See you again.";
const NO_MATCH = "Sorry, that's out of my scope.";
// Instruction flow (3D): robot walking to user
const INSTRUCTION_WAIT_ME = "Ok, I will explain that for you. Wait for me.";
const FOLLOW_UP_ANYTHING_ELSE = "Do you want me to do anything else?";
const FOLLOW_UP_WHAT_QUESTION = "What would you like to know?";
const SORRY_DIDNT_CATCH = "Sorry, I didn't catch that. Do you want me to do anything else?";

function getEnUsLocalVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter(
      (v) =>
        (v.lang === "en-US" || v.lang.startsWith("en-US")) &&
        v.localService === true,
    );
}

function getSamanthaOrFirst(): SpeechSynthesisVoice | null {
  const voices = getEnUsLocalVoices();
  return (
    voices.find((v) => v.name === PREFERRED_VOICE_NAME) || voices[0] || null
  );
}

// Short delay after cancel() before speak() to reduce glitches and volume jumps on some systems (e.g. Mac)
const SPEECH_RESET_DELAY_MS = 60;

function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    const doSpeak = (): void => {
      const voice = getSamanthaOrFirst();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      if (voice) u.voice = voice;
      u.volume = 1;
      u.rate = 1;
      u.pitch = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      setTimeout(() => {
        synth.speak(u);
      }, SPEECH_RESET_DELAY_MS);
    };
    if (synth.getVoices().length > 0) {
      doSpeak();
    } else {
      synth.addEventListener("voiceschanged", doSpeak, { once: true });
    }
  });
}

export function speakGreeting(): Promise<void> {
  return speakText(GREETING);
}

export function speakSeeYouAgain(): Promise<void> {
  return speakText(GOODBYE);
}

export function speakNoMatch(): Promise<void> {
  return speakText(NO_MATCH);
}

// Format action name from backend format (e.g., "turn_on") to natural language (e.g., "turn on")
function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    turn_on: "turn on",
    turn_off: "turn off",
    set_brightness: "set brightness",
    set_colour: "set colour",
    set_volume: "set volume",
    set_channel: "set channel",
    set_mute: "set mute",
    set_speed: "set speed",
    set_swing: "set swing",
    set_temperature: "set temperature",
  };
  return actionMap[action] || action.replace(/_/g, " ");
}

export function speakCompletion(action: string, device: string): void {
  const formattedAction = formatAction(action);
  const message = `Finished ${formattedAction} ${device}`;
  speakText(message);
}

// Predefined instruction texts (guideline / how-to) — same topics as backend instruction_topic
const INSTRUCTION_TEXTS: Record<string, string> = {
  control:
    "You can control your devices in two ways: by voice or from the panel. Say 'how do I use voice?' for the microphone, or 'how do I use the panel?' for the on-screen controls.",
  panel:
    "This is your control panel. It shows your smart home devices. You can tap a device to open its controls, or use the microphone for voice commands. The status text shows what the system is doing. You have one main panel.",
  voice:
    "Tap the microphone button and wait for 'How can I help you?'. Then say things like 'turn on the fan', 'turn off the light', or 'set the temperature to twenty-four'. Tap again to stop listening and hear 'See you again'.",
  on_off:
    "You can turn any device on or off in two ways: tap the device on the panel and use the on/off control, or say 'turn on the fan' or 'turn off the light' using the microphone.",
  usage_graph:
    "Use the usage or 3D graph view to see how a device is used over time. Open a device on the panel and select the usage or graph option to see its data.",
  fan:
    "You can turn the fan on or off from the panel or by saying 'turn on the fan' or 'turn off the fan'. Use the speed and swing controls on the panel, or say 'set fan speed to two' or 'turn on swing'. You can also check the usage view for the fan.",
  light:
    "You can turn the light on or off from the panel or by voice. Use the brightness and colour controls on the panel, or say 'set brightness to fifty' or 'set colour to red'. You can also view usage for the light.",
  television:
    "You can turn the TV on or off from the panel or by voice. Use the volume, channel, and mute controls on the panel, or say 'set volume to fifty', 'set channel to five', or 'mute the TV'. You can also check the usage view.",
  ac:
    "You can turn the air conditioner on or off from the panel or by voice. Use the temperature control on the panel, or say 'set temperature to twenty-four'. You can also view usage for the AC.",
  fallback:
    "I can explain the panel, voice commands, and devices like the fan, light, TV, and AC. You can ask 'how do I control?' for an overview, or name a device or the panel. Which one do you mean?",
  goodbye: GOODBYE,
};

export function speakInstruction(topic: string): Promise<void> {
  const text = INSTRUCTION_TEXTS[topic] ?? INSTRUCTION_TEXTS.fallback;
  return speakText(text);
}

export function speakInstructionWaitMe(): Promise<void> {
  return speakText(INSTRUCTION_WAIT_ME);
}

export function speakFollowUpAnythingElse(): Promise<void> {
  console.log("[TTS] 🔔 speakFollowUpAnythingElse CALLED from:", new Error().stack?.split("\n").slice(1, 4).join(" | "));
  return speakText(FOLLOW_UP_ANYTHING_ELSE);
}

export function speakFollowUpWhatQuestion(): Promise<void> {
  return speakText(FOLLOW_UP_WHAT_QUESTION);
}

export function speakSorryDidntCatch(): Promise<void> {
  return speakText(SORRY_DIDNT_CATCH);
}
