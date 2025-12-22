import { create } from "zustand";
import { toast } from "sonner";

interface UIState {
  loading: boolean;
  errorMessage: string;
  successMessage: string;
  selectedDeviceId: string;
  avatarIsSpeaking: boolean;
  avatarIsListening: boolean;

  setLoading: (isLoading: boolean) => void;
  setError: (message: string) => void;
  setSuccess: (message: string) => void;
  clearError: () => void;
  clearSuccess: () => void;
  clearAllMessages: () => void;
  openDeviceControl: (deviceId: string) => void;
  closeDeviceControl: () => void;
  hasError: () => boolean;
  hasSuccess: () => boolean;
  isControlPanelOpen: () => boolean;
  setAvatarSpeaking: (isSpeaking: boolean) => void;
  setAvatarListening: (isListening: boolean) => void;
  resetState: () => void;
}

export const useUIStore = create<UIState>()(
  (set, get) => ({
    loading: false,
    errorMessage: "",
    successMessage: "",
    selectedDeviceId: "",
    avatarIsSpeaking: false,
    avatarIsListening: false,

    setLoading: (isLoading) => set({ loading: isLoading }),

    setError: (message) => {
      set({ errorMessage: message });
      if (message) {
        toast.error(message);
      }
    },

    setSuccess: (message) => {
      set({ successMessage: message });
      if (message) {
        toast.success(message);
      }
    },

    clearError: () => set({ errorMessage: "" }),

    clearSuccess: () => set({ successMessage: "" }),

    clearAllMessages: () => set({ errorMessage: "", successMessage: "" }),

    openDeviceControl: (deviceId) => set({ selectedDeviceId: deviceId }),

    closeDeviceControl: () => set({ selectedDeviceId: "" }),

    hasError: () => Boolean(get().errorMessage),

    hasSuccess: () => Boolean(get().successMessage),

    isControlPanelOpen: () => Boolean(get().selectedDeviceId),

    setAvatarSpeaking: (isSpeaking) => set({ avatarIsSpeaking: isSpeaking }),

    setAvatarListening: (isListening) => set({ avatarIsListening: isListening }),

    resetState: () => set({
      loading: false,
      errorMessage: "",
      successMessage: "",
      selectedDeviceId: "",
      avatarIsSpeaking: false,
      avatarIsListening: false,
    }),
  })
);