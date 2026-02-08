import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { toast } from "sonner";

const REDIRECT_KEY = "auth_redirect_url";

export class ApiService {
  private static instance: ApiService;
  private client: AxiosInstance;

  private constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_BACKEND_URL || "https://localhost:5500",
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (!error.response) {
          if (
            error.code === "ERR_NETWORK" ||
            error.message?.includes("Network Error")
          ) {
            toast.error(
              "Cannot connect to server. Please check if the backend is running.",
              { id: "network-error" },
            );
          } else if (error.code === "ECONNREFUSED") {
            toast.error("Server is not available. Please try again later.", {
              id: "connection-refused",
            });
          } else {
            toast.error("Network error. Please check your connection.", {
              id: "network-error",
            });
          }
          return Promise.reject(error);
        }

        const status = error.response?.status;
        const url = error.config?.url || "";

        const isAuthEndpoint = url.includes("/api/auth/");

        if (status === 401 && !isAuthEndpoint) {
          this.handleUnauthorized();
        } else if (status === 403) {
          toast.error("You don't have permission to perform this action", {
            id: "forbidden-error",
          });
        } else if (status === 404) {
          // Don't show toast for 404 - let the component handle it
        } else if (status >= 500) {
          toast.error("Server error. Please try again later.", {
            id: "server-error",
          });
        }

        return Promise.reject(error);
      },
    );
  }

  private handleUnauthorized(): void {
    const currentPath = window.location.pathname;
    if (currentPath === "/login" || currentPath === "/register") {
      return;
    }

    import("@/stores/auth").then(({ useAuthStore }) => {
      const { logout, isAuthenticated } = useAuthStore.getState();

      sessionStorage.setItem(REDIRECT_KEY, currentPath);

      logout();

      if (isAuthenticated) {
        toast.error("Session expired. Please log in again.", {
          id: "session-expired",
        });
      }

      window.location.href = "/login";
    });
  }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  static getAndClearRedirectUrl(): string | null {
    const url = sessionStorage.getItem(REDIRECT_KEY);
    if (url) {
      sessionStorage.removeItem(REDIRECT_KEY);
    }
    return url;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}
