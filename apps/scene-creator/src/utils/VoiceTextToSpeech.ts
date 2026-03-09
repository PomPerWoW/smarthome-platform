const PREFERRED_VOICE_NAME = "Samantha";
const GREETING = "How can I help you?";
const GOODBYE = "See you again.";
const NO_MATCH = "I'm sorry, I didn't quite understand that. I can help you with controlling your devices, using the panel, voice commands, and troubleshooting. Try asking me 'what can you do?' to see all the ways I can help, or ask about a specific device like 'how do I use the fan?'. What would you like to know?";
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

export function speakText(text: string): Promise<void> {
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
    "You can control your devices in two simple ways: by voice or from the panel. Say 'how do I use voice?' for the microphone, or 'how do I use the panel?' for the on-screen controls. Don't worry, I'm here to help you every step of the way.",
  panel:
    "This is your control panel. It shows all your smart home devices in one place. You can tap any device to open its controls, or use the microphone for voice commands. The status text at the bottom shows what the system is doing. You have one main panel that's easy to use.",
  voice:
    "Using voice is simple. Tap the microphone button and wait for me to say 'How can I help you?'. Then you can say things like 'turn on the fan', 'turn off the light', or 'set the temperature to twenty-four'. When you're done, tap the microphone again to stop listening. It's that easy!",
  on_off:
    "Turning devices on or off is very simple. You have two ways: first, tap the device on the panel and use the on/off switch you'll see. Or second, just say 'turn on the fan' or 'turn off the light' using the microphone. Both ways work great!",
  usage_graph:
    "You can see how your devices are being used over time. Just open a device on the panel and look for the usage or graph option. This shows you helpful information about when and how much you use each device.",
  fan:
    "The fan is easy to control. You can turn it on or off from the panel or by saying 'turn on the fan' or 'turn off the fan'. On the panel, you'll see speed and swing controls. You can also say 'set fan speed to two' or 'turn on swing'. If you want to see how much you've used the fan, check the usage view.",
  light:
    "The light is simple to use. You can turn it on or off from the panel or by voice. On the panel, you'll find brightness and colour controls. You can also say 'set brightness to fifty' or 'set colour to red'. The usage view shows you how much you've used the light.",
  television:
    "The TV is straightforward to control. You can turn it on or off from the panel or by voice. On the panel, you'll see volume, channel, and mute controls. You can also say 'set volume to fifty', 'set channel to five', or 'mute the TV'. Check the usage view to see your TV watching habits.",
  ac:
    "The air conditioner is easy to manage. You can turn it on or off from the panel or by voice. On the panel, you'll find the temperature control. You can also say 'set temperature to twenty-four'. The usage view shows you how much energy the AC has used.",
  getting_started:
    "Welcome! Let's get you started. First, you can see your devices on the main panel. To control them, you can either tap on them or use the microphone button to give voice commands. Try saying 'how do I use voice?' to learn about voice commands, or 'how do I use the panel?' to learn about the on-screen controls. I'm here to help, so feel free to ask me anything!",
  what_can_you_do:
    "I'm your friendly robot assistant, and I'm here to help you with your smart home! I can explain how to use the panel, how to give voice commands, and how to control all your devices like the fan, light, TV, and air conditioner. I can walk you through step-by-step instructions, help you troubleshoot problems, and answer any questions you have. Just ask me anything, and I'll do my best to help you. What would you like to know?",
  navigation:
    "Let me help you find your way around. The main panel shows all your devices - you'll see it on your screen. To access the welcome panel with all the main controls, press the W key on your keyboard or click the house icon button in the top right corner. The microphone button is usually at the bottom of the screen. If you're ever lost, just ask me 'what can you do?' and I'll guide you. Don't worry, it's simpler than it sounds!",
  welcome_panel:
    "The welcome panel is your main control center. To open it, press the W key on your keyboard, or click the small house icon button in the top right corner of your screen. This panel shows your user information, device statistics, and important buttons like entering AR mode, switching between VR and AR, accessing devices, refreshing, and aligning the room. You can close it anytime by clicking the X button on the panel or pressing W again.",
  troubleshooting:
    "I'm sorry you're having trouble. Let me help you fix it. First, try refreshing the page or saying 'refresh devices'. If a device isn't responding, make sure it's turned on from the panel. If voice commands aren't working, check that the microphone button is active and you're speaking clearly. If the panel isn't showing, press W to open the welcome panel. If nothing works, try closing and reopening the application. Don't worry, we'll figure this out together. What specific problem are you having?",
  device_info:
    "I can tell you about your devices. You can ask me 'how many devices do I have?' to get a count, or 'what devices do I have?' to see a list. I can also help you control them or explain how to use each one.",
  fallback:
    "I'm here to help you! I can explain the panel, voice commands, and all your devices like the fan, light, TV, and air conditioner. You can ask me 'how do I control?' for an overview, or ask about a specific device like 'how do I use the fan?'. You can also ask 'what can you do?' to see all the ways I can help you, or 'how many devices do I have?' to learn about your devices. What would you like to know about?",
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
