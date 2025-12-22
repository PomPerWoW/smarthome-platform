import { create } from "zustand";
import { toast } from "sonner";

interface UIState {

  loading: boolean;
  error_message: string;
  success_message: string;
  selected_device_id: string;
  avatar_is_speaking: boolean;
  avatar_is_listening: boolean;
  
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
  reset_state: () => void;
}

export const useUIStore = create<UIState>()((set, get) => ({

  loading: false,
  error_message: "",
  success_message: "",
  selected_device_id: "",
  avatar_is_speaking: false,
  avatar_is_listening: false,
  
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
  
  reset_state: () => set({
    loading: false,
    error_message: "",
    success_message: "",
    selected_device_id: "",
    avatar_is_speaking: false,
    avatar_is_listening: false,
  }),
}));