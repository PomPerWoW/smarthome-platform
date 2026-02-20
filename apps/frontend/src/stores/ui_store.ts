import { create } from "zustand";
import { toast } from "sonner";

export type VoiceStatus = "idle" | "listening" | "processing";
export type VoiceIdlePayload = { success?: boolean; cancelled?: boolean };

interface UIState {

  loading: boolean;
  error_message: string;
  success_message: string;
  selected_device_id: string;
  avatar_is_speaking: boolean;
  avatar_is_listening: boolean;
  voice_status: VoiceStatus;
  voice_payload: VoiceIdlePayload | null;
  is_any_modal_open: boolean;

  set_loading: (is_loading: boolean) => void;
  set_error: (message: string) => void;
  set_success: (message: string) => void;
  clear_error: () => void;
  clear_success: () => void;
  clear_all_messages: () => void;
  open_device_control: (device_id: string) => void;
  close_device_control: () => void;
  has_error: () => boolean;
  has_success: () => boolean;
  is_control_panel_open: () => boolean;
  set_avatar_speaking: (is_speaking: boolean) => void;
  set_avatar_listening: (is_listening: boolean) => void;
  set_voice_status: (status: VoiceStatus, payload?: VoiceIdlePayload) => void;
  clear_voice_payload: () => void;
  set_modal_open: (open: boolean) => void;
  reset_state: () => void;
}

export const useUIStore = create<UIState>()((set, get) => ({

  loading: false,
  error_message: "",
  success_message: "",
  selected_device_id: "",
  avatar_is_speaking: false,
  avatar_is_listening: false,
  voice_status: "idle",
  voice_payload: null,
  is_any_modal_open: false,

  set_loading: (is_loading) => set({ loading: is_loading }),
  
  set_error: (message) => {
    set({ error_message: message });
    if (message) {
      toast.error(message);
    }
  },
  
  set_success: (message) => {
    set({ success_message: message });
    if (message) {
      toast.success(message);
    }
  },
  
  clear_error: () => set({ error_message: "" }),
  
  clear_success: () => set({ success_message: "" }),
  
  clear_all_messages: () => set({ error_message: "", success_message: "" }),
  
  open_device_control: (device_id) => set({ selected_device_id: device_id }),
  
  close_device_control: () => set({ selected_device_id: "" }),

  has_error: () => Boolean(get().error_message),
  
  has_success: () => Boolean(get().success_message),
  
  is_control_panel_open: () => Boolean(get().selected_device_id),
  
  set_avatar_speaking: (is_speaking) => set({ avatar_is_speaking: is_speaking }),
  
  set_avatar_listening: (is_listening) => set({ avatar_is_listening: is_listening }),

  set_voice_status: (status, payload) =>
    set({
      voice_status: status,
      voice_payload: payload ?? null,
    }),

  clear_voice_payload: () => set({ voice_payload: null }),

  set_modal_open: (open) => set({ is_any_modal_open: open }),

  reset_state: () => set({
    loading: false,
    error_message: "",
    success_message: "",
    selected_device_id: "",
    avatar_is_speaking: false,
    avatar_is_listening: false,
    voice_status: "idle",
    voice_payload: null,
    is_any_modal_open: false,
  }),
}));