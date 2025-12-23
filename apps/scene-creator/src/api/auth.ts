import api from "./axios";
import { User, AuthState } from "../types";

export class AuthService {
  private static instance: AuthService;
  private state: AuthState = {
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

    try {
      const response = await api.get("/api/auth/whoami/");

      console.log("[Auth] Response status:", response.status);
      // Requirements: log token + decrypted user data on page entry
      console.log("[Auth] auth_token:", response.data.token);
      console.log("[Auth] decrypted user data:", response.data.user);
      this.state.user = response.data.user;
      this.state.isAuthenticated = true;
      console.log(
        "[Auth] ✓ Authenticated via cookie! User:",
        response.data.user.email,
      );
      return true;
    } catch (error) {
      console.error("[Auth] Cookie authentication failed:", error);
      this.state.isAuthenticated = false;
      return false;
    }
  }

  getUser(): User | null {
    return this.state.user;
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }
}

export const getAuth = () => AuthService.getInstance();
