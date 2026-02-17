const PREFERRED_VOICE_NAME = "Samantha";
const GREETING = "How can I help you?";
const GOODBYE = "See you again.";

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
