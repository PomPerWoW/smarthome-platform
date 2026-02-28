const PREFERRED_VOICE_NAME = "Samantha";
const GREETING = "How can I help you?";
const GOODBYE = "See you again.";
const NO_MATCH = "Sorry, that's out of my scope.";

function getEnUsLocalVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(
    (v) => (v.lang === "en-US" || v.lang.startsWith("en-US")) && v.localService === true
  );
}

function getSamanthaOrFirst(): SpeechSynthesisVoice | null {
  const voices = getEnUsLocalVoices();
  return voices.find((v) => v.name === PREFERRED_VOICE_NAME) || voices[0] || null;
}

function speakText(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const doSpeak = (): void => {
    const voice = getSamanthaOrFirst();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    if (voice) u.voice = voice;
    synth.speak(u);
  };
  if (synth.getVoices().length > 0) {
    doSpeak();
  } else {
    synth.addEventListener("voiceschanged", doSpeak, { once: true });
  }
}

export function speakGreeting(): void {
  speakText(GREETING);
}

export function speakSeeYouAgain(): void {
  speakText(GOODBYE);
}

export function speakNoMatch(): void {
  speakText(NO_MATCH);
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
