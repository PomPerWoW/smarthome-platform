import React, { useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { voiceService } from "@/services/VoiceService";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui_store";

export const VoiceAssistant: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const setAvatarListening = useUIStore((s) => s.set_avatar_listening);
  const setVoiceStatus = useUIStore((s) => s.set_voice_status);

  const handleToggle = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
      setIsProcessing(false);
      setAvatarListening(false);
      // Cancellation is reported by VoiceService via onStatusChange ("aborted"/onend)
    } else {
      setIsListening(true);
      setAvatarListening(true);
      voiceService.startListening(
        (transcript) => {
          console.log("Transcribed:", transcript);
          setIsProcessing(true);
        },
        () => {
          setIsListening(false);
          setIsProcessing(false);
          setAvatarListening(false);
        },
        (status, payload) => {
          if (status === "listening") setVoiceStatus("listening");
          else if (status === "processing") setVoiceStatus("processing");
          else setVoiceStatus("idle", payload);
        },
      );
    }
  };

  return (
    <div className="px-2 py-0">
      <button
        className={cn(
          "voice-btn relative w-full h-12 rounded-lg overflow-hidden cursor-pointer transition-all duration-300",
          "hover:scale-[1.02] hover:shadow-lg hover:shadow-fuchsia-500/25",
          isListening && "voice-btn-listening",
        )}
        onClick={handleToggle}
      >
        <div className="relative z-10 flex items-center justify-center gap-2 text-white font-medium text-xs h-full">
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : isListening ? (
            <>
              <MicOff className="h-4 w-4" />
              <span>Stop Listening</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>Voice Command</span>
            </>
          )}
        </div>
      </button>
    </div>
  );
};
