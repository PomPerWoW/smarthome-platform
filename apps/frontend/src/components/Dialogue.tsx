import React, { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/ui_store";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialogue: React.FC = () => {
  const messages = useUIStore((s) => s.dialogue_messages);
  const clearDialogue = useUIStore((s) => s.clear_dialogue);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-[200px] right-8 z-[999] w-[320px] max-h-[400px] flex flex-col bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-semibold">Conversation</h3>
        <button
          onClick={clearDialogue}
          className="p-1 hover:bg-muted rounded-md transition-colors"
          aria-label="Clear conversation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.sender === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                message.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <div className="font-medium text-xs mb-1 opacity-70">
                {message.sender === "user" ? "You" : "Robot Assistant"}
              </div>
              <div>{message.text}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
