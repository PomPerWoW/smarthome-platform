import api from "./axios";
import { User, AuthState } from "../types";

export class AuthService {
  private static instance: AuthService;
  private state: AuthState = {
    token: null,
    user: null,
    isAuthenticated: false,
  };

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<boolean> {
    console.log("[Auth] ===== INITIALIZING AUTHENTICATION =====");

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");

    if (urlToken) {
      console.log("[Auth] ✓ Found token in URL");
      this.state.token = urlToken;
    }

    if (!this.state.token) {
      console.error("[Auth] No authentication token found");
      return false;
    }

    console.log("[Auth] Verifying token with backend...");
    const isValid = await this.verifyToken();

    if (isValid && urlToken) {
      console.log("[Auth] Token verified");
    }

    return isValid;
  }

  async verifyToken(): Promise<boolean> {
    if (!this.state.token) {
      console.error("[Auth] ✗ No token to verify");
      return false;
    }

    console.log("[Auth] Calling:", "/api/auth/whoami/");

    try {
      const response = await api.get("/api/auth/whoami/", {
        headers: {
          Authorization: `Token ${this.state.token}`,
        },
      });

      console.log("[Auth] Response status:", response.status);
      this.state.user = response.data.user;
      this.state.isAuthenticated = true;
      console.log("[Auth] ✓ Token verified! User:", response.data.user.email);
      return true;
    } catch (error) {
      console.error("[Auth] Token verification error:", error);
      this.state.isAuthenticated = false;
      return false;
    }
  }

  getToken(): string | null {
    return this.state.token;
  }

  getUser(): User | null {
    return this.state.user;
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }
}

export const getAuth = () => AuthService.getInstance();
